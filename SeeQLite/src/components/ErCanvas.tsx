import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Catalog, CatalogForeignKey, CatalogTable } from '../engine/protocol';
import { buildJoinSql } from '../sql';

export const MAX_DIAGRAM_TABLES = 75;

const NODE_WIDTH = 248;
const NODE_HEADER = 52;
const ROW_HEIGHT = 26;
const MAX_ROWS = 8;
const GAP_X = 72;
const GAP_Y = 60;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.4;
const CLICK_SLOP = 5;

type Point = { x: number; y: number };
type NodeBox = Point & { w: number; h: number };
type DragState =
  | { mode: 'pan'; pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean }
  | { mode: 'node'; pointerId: number; name: string; startX: number; startY: number; originX: number; originY: number; moved: boolean };

function nodeHeight(table: CatalogTable) {
  const rows = Math.min(table.columns.length, MAX_ROWS);
  const overflow = table.columns.length > MAX_ROWS ? ROW_HEIGHT : 0;
  return NODE_HEADER + rows * ROW_HEIGHT + overflow + 8;
}

// Deterministic grid so a diagram always opens tidy and re-arranges the same way.
function gridLayout(tables: CatalogTable[]): Record<string, Point> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const columnHeights = new Array(columns).fill(GAP_Y);
  const positions: Record<string, Point> = {};
  tables.forEach((table, index) => {
    const column = index % columns;
    positions[table.name] = { x: GAP_X + column * (NODE_WIDTH + GAP_X), y: columnHeights[column] };
    columnHeights[column] += nodeHeight(table) + GAP_Y;
  });
  return positions;
}

function foreignKeyColumns(catalog: Catalog, tableName: string) {
  return new Set(catalog.foreignKeys.filter((relation) => relation.fromTable === tableName).flatMap((relation) => relation.fromColumns));
}

export function ErCanvas({ catalog, onSelectTable, onGenerateJoin }: { catalog: Catalog | null; onSelectTable: (table: CatalogTable) => void; onGenerateJoin: (relation: CatalogForeignKey) => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // click fires after pointerup, once dragRef is already cleared — this survives that gap.
  const draggedRef = useRef(false);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [selected, setSelected] = useState<string | null>(null);

  const tables = catalog?.tables ?? [];
  const tableKey = tables.map((table) => table.name).join('|');

  const boxes = useMemo(() => {
    const map = new Map<string, NodeBox>();
    for (const table of tables) {
      const position = positions[table.name];
      if (position) map.set(table.name, { ...position, w: NODE_WIDTH, h: nodeHeight(table) });
    }
    return map;
  }, [positions, tableKey]);

  const fit = useCallback((next: Record<string, Point>, list: CatalogTable[]) => {
    const canvas = canvasRef.current;
    if (!canvas || list.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const table of list) {
      const position = next[table.name];
      if (!position) continue;
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + NODE_WIDTH);
      maxY = Math.max(maxY, position.y + nodeHeight(table));
    }
    if (!Number.isFinite(minX)) return;
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(1, (canvas.clientWidth - 48) / contentW, (canvas.clientHeight - 48) / contentH));
    setZoom(nextZoom);
    setPan({
      x: (canvas.clientWidth - contentW * nextZoom) / 2 - minX * nextZoom,
      y: (canvas.clientHeight - contentH * nextZoom) / 2 - minY * nextZoom,
    });
  }, []);

  // Reset layout whenever the set of tables changes, then fit once.
  useLayoutEffect(() => {
    const next = gridLayout(tables);
    setPositions(next);
    setSelected(null);
    fit(next, tables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey]);

  const arrange = () => {
    const next = gridLayout(tables);
    setPositions(next);
    fit(next, tables);
  };

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (!canvas) { setZoom(nextZoom); return; }
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    setPan((current) => ({ x: cx - (cx - current.x) * (nextZoom / zoom), y: cy - (cy - current.y) * (nextZoom / zoom) }));
    setZoom(nextZoom);
  };

  // Native non-passive wheel listener so preventDefault actually blocks browser page zoom/scroll.
  // Plain wheel/trackpad pans; ctrl/⌘ + wheel (and pinch) zooms toward the cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const z = zoomRef.current;
      if (event.ctrlKey || event.metaKey) {
        const rect = canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
        setPan((current) => ({ x: px - (px - current.x) * (nextZoom / z), y: py - (py - current.y) * (nextZoom / z) }));
        setZoom(nextZoom);
      } else {
        setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  const onBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { mode: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false };
  };

  const onNodePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, table: CatalogTable) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const origin = positions[table.name] ?? { x: 0, y: 0 };
    dragRef.current = { mode: 'node', pointerId: event.pointerId, name: table.name, startX: event.clientX, startY: event.clientY, originX: origin.x, originY: origin.y, moved: false };
    setSelected(table.name);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > CLICK_SLOP) drag.moved = true;
    if (drag.mode === 'pan') {
      setPan({ x: drag.panX + dx, y: drag.panY + dy });
    } else {
      const nextX = drag.originX + dx / zoom;
      const nextY = drag.originY + dy / zoom;
      setPositions((current) => ({ ...current, [drag.name]: { x: nextX, y: nextY } }));
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    draggedRef.current = drag.moved;
    dragRef.current = null;
  };

  if (!catalog) return <div className="diagram-empty">Open a database to see its tables and relationships.</div>;
  if (catalog.limits.length) return <div className="diagram-empty">The catalog is limited to a bounded searchable list. Open a smaller database to render its ER diagram.</div>;
  if (catalog.tables.length > MAX_DIAGRAM_TABLES) return <div className="diagram-empty">The ER diagram is limited to {MAX_DIAGRAM_TABLES} tables. Search the catalog or open a smaller database to inspect its shape.</div>;

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="er-layout">
      <div className="er-diagram">
        <div className="er-toolbar" role="toolbar" aria-label="Diagram controls">
          <span className="label">DIAGRAM</span>
          <span className="er-scope">{catalog.tables.length} table{catalog.tables.length === 1 ? '' : 's'} · {catalog.foreignKeys.length} relation{catalog.foreignKeys.length === 1 ? '' : 's'}</span>
          <div className="er-toolbar-actions">
            <button className="quiet-button" onClick={arrange}>Arrange</button>
            <button className="quiet-button" onClick={() => fit(positions, tables)}>Fit</button>
            <div className="er-zoom" role="group" aria-label="Zoom">
              <button className="er-zoom-button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
              <span aria-live="polite">{zoomPercent}%</span>
              <button className="er-zoom-button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
            </div>
          </div>
        </div>
        <div
          ref={canvasRef}
          className="er-canvas"
          role="region"
          aria-label="Entity relationship diagram"
          tabIndex={0}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="er-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg className="er-edges" aria-hidden="true" width={4000} height={4000}>
              <defs>
                {(['default', 'active', 'unresolved'] as const).map((kind) => (
                  <marker key={kind} id={`er-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" />
                  </marker>
                ))}
              </defs>
              {catalog.foreignKeys.map((relation) => {
                const from = boxes.get(relation.fromTable);
                const to = boxes.get(relation.toTable);
                if (!from || !to) return null;
                const active = selected === relation.fromTable || selected === relation.toTable;
                const resolved = Boolean(buildJoinSql(relation, catalog));
                const [x1, y1, x2, y2] = edgeEndpoints(from, to);
                return (
                  <g key={`${relation.fromTable}-${relation.id}-${relation.toTable}`} className={`er-edge${active ? ' active' : ''}${resolved ? '' : ' unresolved'}`}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#er-arrow-${active ? 'active' : resolved ? 'default' : 'unresolved'})`} />
                  </g>
                );
              })}
            </svg>
            {catalog.tables.map((table) => {
              const position = positions[table.name];
              if (!position) return null;
              const fkCols = foreignKeyColumns(catalog, table.name);
              const active = selected === table.name;
              return (
                <button
                  key={table.name}
                  className={`er-node${active ? ' active' : ''}`}
                  style={{ left: position.x, top: position.y, width: NODE_WIDTH }}
                  aria-label={`Open ${table.name} table`}
                  onPointerDown={(event) => onNodePointerDown(event, table)}
                  onClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } onSelectTable(table); }}
                >
                  <span className="er-node-title"><span className="er-node-name">{table.name}</span><span className="er-node-kind">{table.kind}</span></span>
                  {table.columns.slice(0, MAX_ROWS).map((column) => (
                    <span className="er-node-row" key={column.name}>
                      <b className={column.primaryKey ? 'er-key pk' : fkCols.has(column.name) ? 'er-key fk' : 'er-key'} aria-hidden="true" />
                      <span className="er-col-name">{column.name}</span>
                      <small className="er-col-type">{(column.type || 'ANY').toUpperCase()}</small>
                    </span>
                  ))}
                  {table.columns.length > MAX_ROWS && <span className="er-node-more">+ {table.columns.length - MAX_ROWS} more columns</span>}
                </button>
              );
            })}
          </div>
          {catalog.tables.length === 0 ? <div className="er-hint">This database has no tables to diagram.</div> : <div className="er-hint">Drag a table to move it · drag the canvas to pan · ⌘/Ctrl + scroll to zoom</div>}
        </div>
      </div>
      <RelationshipList catalog={catalog} selected={selected} onSelectTable={(table) => { setSelected(table.name); onSelectTable(table); }} onGenerateJoin={onGenerateJoin} />
    </div>
  );
}

// Anchor each edge on the facing side of both node boxes so lines read as flows.
function edgeEndpoints(from: NodeBox, to: NodeBox): [number, number, number, number] {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const horizontal = Math.abs(tc.x - fc.x) >= Math.abs(tc.y - fc.y);
  if (horizontal) {
    const x1 = fc.x + (tc.x >= fc.x ? from.w / 2 : -from.w / 2);
    const x2 = tc.x + (tc.x >= fc.x ? -to.w / 2 : to.w / 2);
    return [x1, fc.y, x2, tc.y];
  }
  const y1 = fc.y + (tc.y >= fc.y ? from.h / 2 : -from.h / 2);
  const y2 = tc.y + (tc.y >= fc.y ? -to.h / 2 : to.h / 2);
  return [fc.x, y1, tc.x, y2];
}

function RelationshipList({ catalog, selected, onSelectTable, onGenerateJoin }: { catalog: Catalog; selected: string | null; onSelectTable: (table: CatalogTable) => void; onGenerateJoin: (relation: CatalogForeignKey) => void }) {
  const tableByName = new Map(catalog.tables.map((table) => [table.name, table]));
  return (
    <section className="relationship-panel" aria-label="Declared relationships">
      <div className="result-heading"><span className="label">RELATIONSHIPS</span><span>{catalog.foreignKeys.length} declared</span></div>
      {catalog.foreignKeys.length ? (
        <ul className="relationship-list">
          {catalog.foreignKeys.map((relation) => {
            const resolved = Boolean(tableByName.get(relation.fromTable) && tableByName.get(relation.toTable) && buildJoinSql(relation, catalog));
            const active = selected === relation.fromTable || selected === relation.toTable;
            return (
              <li key={`${relation.fromTable}-${relation.id}-${relation.toTable}`} className={active ? 'active' : ''}>
                <span className="relationship-kind">FOREIGN KEY · MANY → ONE</span>
                <span className={resolved ? 'relationship-status resolved' : 'relationship-status unresolved'}>{resolved ? 'RESOLVED' : 'UNRESOLVED'}</span>
                <div className="relationship-tables">
                  <button className="relationship-table" onClick={() => tableByName.get(relation.fromTable) && onSelectTable(tableByName.get(relation.fromTable)!)} aria-label={`Open ${relation.fromTable} table`}>{relation.fromTable}</button>
                  <span aria-hidden="true">→</span>
                  <button className="relationship-table" onClick={() => tableByName.get(relation.toTable) && onSelectTable(tableByName.get(relation.toTable)!)} aria-label={`Open ${relation.toTable} table`}>{relation.toTable}</button>
                </div>
                <small><code>{relation.fromColumns.join(', ')}</code> references <code>{relation.toColumns.filter(Boolean).join(', ') || 'the parent primary key'}</code></small>
                <small>ON UPDATE {relation.onUpdate} · ON DELETE {relation.onDelete} · MATCH {relation.match}</small>
                <button className="relationship-join" onClick={() => onGenerateJoin(relation)} disabled={!resolved} aria-label={`Generate join from ${relation.fromTable} to ${relation.toTable}`} title={resolved ? 'Generate a quoted read-only join' : 'The referenced table or columns could not be resolved'}>Generate join</button>
              </li>
            );
          })}
        </ul>
      ) : <p className="relationship-empty">No declared foreign keys. The diagram still shows every table and view.</p>}
    </section>
  );
}
