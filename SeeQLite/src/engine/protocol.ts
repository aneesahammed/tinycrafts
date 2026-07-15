export type WorkerRequest =
  | { type: 'open'; requestId: string; epoch: number; bytes: ArrayBuffer; fileName: string }
  | { type: 'query'; requestId: string; epoch: number; sql: string };

export type Column = { name: string };

export type CatalogColumn = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: number;
  defaultValue: string | null;
};

export type CatalogIndex = {
  name: string;
  unique: boolean;
  columns: string[];
};

export type CatalogTable = {
  name: string;
  kind: 'table' | 'view';
  columns: CatalogColumn[];
  indexes: CatalogIndex[];
};

export type CatalogForeignKey = {
  id: number;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
};

export type Catalog = {
  tables: CatalogTable[];
  foreignKeys: CatalogForeignKey[];
};

export type QueryValue = string | number | bigint | null | { kind: 'blob'; bytes: number; preview: string };

export type QueryResult = {
  columns: Column[];
  rows: QueryValue[][];
  returnedRows: number;
  truncated: boolean;
};

export type WorkerResponse =
  | { type: 'ready'; requestId: string; epoch: number; fileName: string; tableCount: number; catalog: Catalog }
  | { type: 'result'; requestId: string; epoch: number; result: QueryResult }
  | { type: 'error'; requestId: string; epoch: number; code: string; message: string };
