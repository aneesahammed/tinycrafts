export type WorkerRequest =
  | { type: 'open'; requestId: string; epoch: number; bytes: ArrayBuffer; fileName: string }
  | { type: 'query'; requestId: string; epoch: number; sql: string }
  | { type: 'details'; requestId: string; epoch: number; tableName: string };

export type Column = { name: string };

export type CatalogColumn = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: number;
  defaultValue: string | null;
  hidden: number;
};

export type CatalogIndexColumn = {
  name: string | null;
  expression: boolean;
  descending: boolean;
};

export type CatalogIndex = {
  name: string;
  unique: boolean;
  origin: 'created' | 'unique' | 'primary-key' | 'unknown';
  partial: boolean;
  predicate: string | null;
  columns: CatalogIndexColumn[];
};

export type CatalogWarning = 'columns-unavailable' | 'columns-limited' | 'foreign-keys-unavailable';

export type CatalogLimit = {
  kind: 'objects' | 'columns' | 'relationships';
  limit: number;
};

export type CatalogTable = {
  name: string;
  kind: 'table' | 'view' | 'virtual' | 'shadow';
  internal: boolean;
  schemaSql: string | null;
  withoutRowid: boolean;
  strict: boolean;
  columns: CatalogColumn[];
  indexes: CatalogIndex[];
  warnings?: CatalogWarning[];
};

export type CatalogForeignKey = {
  id: number;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  onUpdate: string;
  onDelete: string;
  match: string;
};

export type Catalog = {
  tables: CatalogTable[];
  foreignKeys: CatalogForeignKey[];
  limits: CatalogLimit[];
};

export type CatalogDetails = {
  tableName: string;
  indexes: CatalogIndex[];
};

export type QueryText = { kind: 'text'; value: string; bytes: number; truncated: boolean };
export type QueryBlob = { kind: 'blob'; bytes: number; preview: string; previewBytes: number; truncated: boolean };
export type QueryValue = string | number | bigint | null | QueryText | QueryBlob;

export type QueryResult = {
  columns: Column[];
  rows: QueryValue[][];
  returnedRows: number;
  truncated: boolean;
  truncationReason?: 'row-limit' | 'cell-limit' | 'byte-limit';
};

export type WorkerResponse =
  | { type: 'ready'; requestId: string; epoch: number; fileName: string; tableCount: number; catalog: Catalog }
  | { type: 'details'; requestId: string; epoch: number; details: CatalogDetails }
  | { type: 'result'; requestId: string; epoch: number; result: QueryResult }
  | { type: 'error'; requestId: string; epoch: number; code: string; message: string };
