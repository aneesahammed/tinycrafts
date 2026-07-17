import { SQLITE_RUNTIME_LOAD_ERROR } from './protocol';
import type { Catalog, CatalogDetails, QueryResult, WorkerRequest, WorkerResponse } from './protocol';

type Pending = { epoch: number; resolve: (value: unknown) => void; reject: (error: Error) => void };

export class DatabaseClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private sequence = 0;
  private epoch = 0;

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending || pending.epoch !== response.epoch || response.epoch !== this.epoch) return;
      if (response.type === 'error') {
        pending.reject(new Error(response.message));
      } else if (response.type === 'ready') {
        pending.resolve(response);
      } else if (response.type === 'details') {
        pending.resolve(response.details);
      } else {
        pending.resolve(response.result);
      }
      this.pending.delete(response.requestId);
    });
    worker.addEventListener('error', () => this.rejectAll(SQLITE_RUNTIME_LOAD_ERROR));
    this.worker = worker;
    return worker;
  }

  private send<T>(request: WorkerRequest, transfer: Transferable[] = []) {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.requestId, { epoch: request.epoch, resolve: resolve as (value: unknown) => void, reject });
      this.ensureWorker().postMessage(request, transfer);
    });
  }

  async open(file: File) {
    const bytes = await file.arrayBuffer();
    return this.openBytes(bytes, file.name);
  }

  openBytes(bytes: ArrayBuffer, fileName: string) {
    this.terminate('Opening a new database.');
    const epoch = ++this.epoch;
    const requestId = `open-${++this.sequence}`;
    return this.send<{ fileName: string; tableCount: number; catalog: Catalog }>(
      { type: 'open', requestId, epoch, bytes, fileName },
      [bytes],
    );
  }

  async openSample(url = './sample.sqlite') {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('The bundled sample database could not be loaded.');
    return this.openBytes(await response.arrayBuffer(), 'sample.sqlite');
  }

  query(sql: string) {
    if (!this.worker) return Promise.reject(new Error('Open a SQLite database before running a query.'));
    const requestId = `query-${++this.sequence}`;
    return this.send<QueryResult>({ type: 'query', requestId, epoch: this.epoch, sql });
  }

  details(tableName: string) {
    if (!this.worker) return Promise.reject(new Error('Open a SQLite database before loading object details.'));
    const requestId = `details-${++this.sequence}`;
    return this.send<CatalogDetails>({ type: 'details', requestId, epoch: this.epoch, tableName });
  }

  terminate(message = 'SQLite worker was reset.') {
    this.epoch += 1;
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(message);
  }

  private rejectAll(message: string) {
    for (const { reject } of this.pending.values()) reject(new Error(message));
    this.pending.clear();
  }
}
