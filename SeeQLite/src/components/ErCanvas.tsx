import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Catalog, CatalogForeignKey, CatalogTable } from '../engine/protocol';
import { buildJoinSql } from '../sql';

export const MAX_DIAGRAM_TABLES = 75;

const NODE_WIDTH = 248;
const NODE_HEADER = 52;
const NODE_TITLE_HEIGHT = 36;
const ROW_HEIGHT = 26;
const MAX_ROWS = 8;
const GAP_X = 104;
const GAP_Y = 60;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.4;
const CLICK_SLOP = 5;

type Point = { x: number; y: number };
type NodeBox = Point & { w: number; h: number };
type EdgeRoute = {
  path: string;
  fromBadge: Point;
  toBadge: Point;
  label: Point;
};
type DiagramRelation = { relation: CatalogForeignKey; count: number; key: string };
type DragState =
  | { mode: 'pan'; pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean }
  | { mode: 'node'; pointerId: number; name: string; startX: number; startY: number; originX: number; originY: number; moved: boolean };

function nodeHeight(table: CatalogTable) {
  const rows = Math.min(table.columns.length, MAX_ROWS);
  const overflow = table.columns.length > MAX_ROWS ? ROW_HEIGHT : 0;
  return NODE_HEADER + rows * ROW_HEIGHT + overflow + 8;
}

// Keep connected tables adjacent while preserving a deterministic grid for fast,
// dependency-free layout. Isolated views and tables follow the connected groups.
function relationshipOrder(tables: CatalogTable[], relations: CatalogForeignKey[]) {
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  const adjacency = new Map(tables.map((table) => [table.name, new Set<string>()]));
  for (const relation of relations) {
    if (relation.fromTable === relation.toTable || !tableByName.has(relation.fromTable) || !tableByName.has(relation.toTable)) continue;
    adjacency.get(relation.fromTable)?.add(relation.toTable);
    adjacency.get(relation.toTable)?.add(relation.fromTable);
  }
  const compare = (left: CatalogTable, right: CatalogTable) => {
    const degreeDifference = (adjacency.get(right.name)?.size ?? 0) - (adjacency.get(left.name)?.size ?? 0);
    return degreeDifference || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  };
  const connected = tables.filter((table) => adjacency.get(table.name)?.size).sort(compare);
  const isolated = tables.filter((table) => !adjacency.get(table.name)?.size).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  const ordered: CatalogTable[] = [];
  const visited = new Set<string>();
  for (const seed of connected) {
    if (visited.has(seed.name)) continue;
    const queue = [seed];
    visited.add(seed.name);
    while (queue.length) {
      const current = queue.shift()!;
      ordered.push(current);
      const neighbours = [...(adjacency.get(current.name) ?? [])]
        .flatMap((name) => tableByName.get(name) ?? [])
        .filter((table) => !visited.has(table.name))
        .sort(compare);
      for (const neighbour of neighbours) {
        visited.add(neighbour.name);
        queue.push(neighbour);
      }
    }
  }
  return [...ordered, ...isolated];
}

function gridLayout(tables: CatalogTable[], relations: CatalogForeignKey[]): Record<string, Point> {
  const orderedTables = relationshipOrder(tables, relations);
  const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const columnHeights = new Array(columns).fill(GAP_Y);
  const positions: Record<string, Point> = {};
  orderedTables.forEach((table, index) => {
    const column = index % columns;
    positions[table.name] = { x: GAP_X + column * (NODE_WIDTH + GAP_X), y: columnHeights[column] };
    columnHeights[column] += nodeHeight(table) + GAP_Y;
  });
  return positions;
}

function foreignKeyColumns(catalog: Catalog, tableName: string) {
  return new Set(catalog.foreignKeys.filter((relation) => relation.fromTable === tableName).flatMap((relation) => relation.fromColumns));
}

function relationKey(relation: CatalogForeignKey) {
  return `${relation.fromTable}\u0000${relation.id}\u0000${relation.toTable}`;
}

function diagramRelations(relations: CatalogForeignKey[]): DiagramRelation[] {
  const grouped = new Map<string, DiagramRelation>();
  for (const relation of relations) {
    const signature = JSON.stringify([relation.fromTable, relation.toTable, relation.fromColumns, relation.toColumns, relation.onUpdate, relation.onDelete, relation.match]);
    const existing = grouped.get(signature);
    if (existing) existing.count += 1;
    else grouped.set(signature, { relation, count: 1, key: relationKey(relation) });
  }
  return [...grouped.values()];
}

function relationLaneOffsets(relations: CatalogForeignKey[]) {
  const groups = new Map<string, CatalogForeignKey[]>();
  for (const relation of relations) {
    const pair = [relation.fromTable, relation.toTable].sort().join('\u0000');
    groups.set(pair, [...(groups.get(pair) ?? []), relation]);
  }
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    group.forEach((relation, index) => offsets.set(relationKey(relation), (index - (group.length - 1) / 2) * 18));
  }
  return offsets;
}

function relationColumnLabel(relation: CatalogForeignKey, count: number) {
  const mapping = relation.fromColumns.length === 1 ? `${relation.fromColumns[0]} → ${relation.toColumns[0] || 'parent key'}` : `${relation.fromColumns.length}-col FK`;
  return count > 1 ? `${mapping} · ${count}×` : mapping;
}

function columnAnchorY(box: NodeBox, table: CatalogTable, columnName: string | undefined) {
  const implicitPrimaryKey = table.columns.find((column) => column.primaryKey)?.name;
  const index = table.columns.findIndex((column) => column.name === (columnName || implicitPrimaryKey));
  return index >= 0 && index < MAX_ROWS ? box.y + NODE_TITLE_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2 : box.y + box.h / 2;
}

function roundedOrthogonalPath(points: Point[], radius = 12) {
  if (points.length < 2) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const bend = Math.min(radius, incoming / 2, outgoing / 2);
    if (!bend) continue;
    const enter = {
      x: corner.x - ((corner.x - previous.x) / incoming) * bend,
      y: corner.y - ((corner.y - previous.y) / incoming) * bend,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) / outgoing) * bend,
      y: corner.y + ((next.y - corner.y) / outgoing) * bend,
    };
    path += ` L ${enter.x} ${enter.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function routeRelationship(relation: CatalogForeignKey, from: NodeBox, to: NodeBox, fromTable: CatalogTable, toTable: CatalogTable, lane: number): EdgeRoute {
  const fromColumnY = columnAnchorY(from, fromTable, relation.fromColumns[0]);
  const toColumnY = columnAnchorY(to, toTable, relation.toColumns[0]);
  if (relation.fromTable === relation.toTable) {
    const loopRight = from.x + from.w + 54 + Math.abs(lane);
    const loopTop = from.y - 44 - Math.abs(lane);
    const start = { x: from.x + from.w, y: fromColumnY };
    const end = { x: from.x + from.w * 0.72, y: from.y };
    return {
      path: roundedOrthogonalPath([start, { x: loopRight, y: start.y }, { x: loopRight, y: loopTop }, { x: end.x, y: loopTop }, end]),
      fromBadge: { x: start.x + 18, y: start.y },
      toBadge: { x: end.x, y: end.y - 18 },
      label: { x: (loopRight + end.x) / 2, y: loopTop - 14 },
    };
  }

  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);
  if (horizontal) {
    const direction = toCenter.x >= fromCenter.x ? 1 : -1;
    const start = { x: fromCenter.x + direction * from.w / 2, y: fromColumnY };
    const end = { x: toCenter.x - direction * to.w / 2, y: toColumnY };
    const middleX = (start.x + end.x) / 2 + lane;
    return {
      path: roundedOrthogonalPath([start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end]),
      fromBadge: { x: start.x + direction * 18, y: start.y },
      toBadge: { x: end.x - direction * 18, y: end.y },
      label: { x: middleX, y: Math.min(start.y, end.y) - 28 },
    };
  }

  const direction = toCenter.y >= fromCenter.y ? 1 : -1;
  const start = { x: fromCenter.x + lane, y: fromCenter.y + direction * from.h / 2 };
  const end = { x: toCenter.x + lane, y: toCenter.y - direction * to.h / 2 };
  const middleY = (start.y + end.y) / 2 + lane;
  return {
    path: roundedOrthogonalPath([start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end]),
    fromBadge: { x: start.x, y: start.y + direction * 18 },
    toBadge: { x: end.x, y: end.y - direction * 18 },
    label: { x: (start.x + end.x) / 2, y: middleY - 20 },
  };
}

export function ErCanvas({ catalog, selectedTableName = null, onSelectTable }: { catalog: Catalog | null; selectedTableName?: string | null; onSelectTable: (table: CatalogTable) => void }) {
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

  useEffect(() => {
    setSelected(selectedTableName);
  }, [selectedTableName]);

  const tables = catalog?.tables ?? [];
  const relations = catalog?.foreignKeys ?? [];
  const tableKey = tables.map((table) => table.name).join('|');
  const diagramKey = `${tableKey}::${relations.map(relationKey).join('|')}`;
  const tableByName = useMemo(() => new Map(tables.map((table) => [table.name, table])), [tables]);
  const renderedRelations = useMemo(() => diagramRelations(relations), [relations]);
  const laneOffsets = useMemo(() => relationLaneOffsets(renderedRelations.map(({ relation }) => relation)), [renderedRelations]);

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
    const next = gridLayout(tables, relations);
    setPositions(next);
    setSelected(null);
    fit(next, tables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramKey]);

  const arrange = () => {
    const next = gridLayout(tables, relations);
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
          <span className="er-scope">{catalog.tables.length} object{catalog.tables.length === 1 ? '' : 's'} · {catalog.foreignKeys.length} relation{catalog.foreignKeys.length === 1 ? '' : 's'}</span>
          {catalog.foreignKeys.length ? <div className="er-legend" aria-label="Relationship cardinality legend"><span><b>N</b> child</span><span><b>1</b> parent</span></div> : null}
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
              {renderedRelations.map(({ relation, count, key }) => {
                const from = boxes.get(relation.fromTable);
                const to = boxes.get(relation.toTable);
                const fromTable = tableByName.get(relation.fromTable);
                const toTable = tableByName.get(relation.toTable);
                if (!from || !to || !fromTable || !toTable) return null;
                const active = selected === relation.fromTable || selected === relation.toTable;
                const resolved = Boolean(buildJoinSql(relation, catalog));
                const route = routeRelationship(relation, from, to, fromTable, toTable, laneOffsets.get(relationKey(relation)) ?? 0);
                return (
                  <g key={key} className={`er-edge${active ? ' active' : ''}${resolved ? '' : ' unresolved'}`} data-self-relation={relation.fromTable === relation.toTable ? 'true' : undefined} data-constraint-count={count}>
                    <path className="er-edge-halo" d={route.path} />
                    <path className="er-edge-line" d={route.path} />
                    <g className="er-cardinality er-cardinality-from" transform={`translate(${route.fromBadge.x} ${route.fromBadge.y})`}>
                      <circle r="11" />
                      <text textAnchor="middle" dominantBaseline="central">N</text>
                    </g>
                    <g className="er-cardinality er-cardinality-to" transform={`translate(${route.toBadge.x} ${route.toBadge.y})`}>
                      <circle r="11" />
                      <text textAnchor="middle" dominantBaseline="central">1</text>
                    </g>
                    {active ? <text className="er-edge-label" x={route.label.x} y={route.label.y} textAnchor="middle" dominantBaseline="central">{relationColumnLabel(relation, count)}</text> : null}
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
    </div>
  );
}

export function RelationshipList({ catalog, selected, onSelectTable, onGenerateJoin }: { catalog: Catalog; selected: string | null; onSelectTable: (table: CatalogTable) => void; onGenerateJoin: (relation: CatalogForeignKey) => void }) {
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
