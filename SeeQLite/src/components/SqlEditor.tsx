import { useEffect, useMemo, useRef } from 'react';
import { SQLite, sql } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Catalog } from '../engine/protocol';

type SqlEditorProps = {
  value: string;
  catalog: Catalog | null;
  onChange: (value: string) => void;
  onRun: (selection?: string) => void;
  onPlan: (selection?: string) => void;
};

// Chrome (border, focus, sizing) belongs to the surrounding .editor-pane — the
// editor itself only styles text, gutter, and selection.
const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--paper-3)', color: 'var(--ink)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 8px', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--paper-3)', borderRight: '1px solid var(--rule)', color: 'var(--ink-3)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '38px' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--paper-2)', color: 'var(--ink-2)' },
  '.cm-line': { padding: '0 8px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent-soft) 55%, transparent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft) !important' },
  '&.cm-focused': { outline: 'none' },
});

const sqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, class: 'sql-token-keyword' },
  { tag: tags.number, class: 'sql-token-number' },
  { tag: tags.string, class: 'sql-token-string' },
  { tag: tags.comment, class: 'sql-token-comment' },
  { tag: tags.operator, class: 'sql-token-operator' },
  { tag: tags.variableName, class: 'sql-token-variable' },
  { tag: tags.typeName, class: 'sql-token-type' },
  { tag: tags.function(tags.variableName), class: 'sql-token-function' },
]);

function shortcutHandlers(onRun: (selection?: string) => void, onPlan: (selection?: string) => void) {
  return EditorView.domEventHandlers({
    keydown(event, view) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return false;
      event.preventDefault();
      const selection = view.state.selection.main;
      const selectedText = selection.from === selection.to ? undefined : view.state.sliceDoc(selection.from, selection.to);
      if (event.shiftKey) onPlan(selectedText);
      else onRun(selectedText);
      return true;
    },
  });
}

export function SqlEditor({ value, catalog, onChange, onRun, onPlan }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onPlanRef = useRef(onPlan);
  const schema = useMemo(() => Object.fromEntries((catalog?.tables ?? []).map((table) => [table.name, table.columns.map((column) => column.name)])), [catalog]);

  valueRef.current = value;
  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  onPlanRef.current = onPlan;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        syntaxHighlighting(sqlHighlightStyle, { fallback: true }),
        sql({ dialect: SQLite, schema, upperCaseKeywords: true }),
        autocompletion({ activateOnTyping: true }),
        keymap.of([
          { key: 'Mod-Enter', run: (target) => { const selection = target.state.selection.main; onRunRef.current(selection.from === selection.to ? undefined : target.state.sliceDoc(selection.from, selection.to)); return true; } },
          { key: 'Mod-Shift-Enter', run: (target) => { const selection = target.state.selection.main; onPlanRef.current(selection.from === selection.to ? undefined : target.state.sliceDoc(selection.from, selection.to)); return true; } },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.contentAttributes.of({ 'aria-label': 'SQL query', 'aria-multiline': 'true' }),
        shortcutHandlers(() => onRunRef.current(), () => onPlanRef.current()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            valueRef.current = next;
            onChangeRef.current(next);
          }
        }),
        editorTheme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    view.current.scrollDOM.tabIndex = 0;
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: StateEffect.reconfigure.of([
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      syntaxHighlighting(sqlHighlightStyle, { fallback: true }),
      sql({ dialect: SQLite, schema, upperCaseKeywords: true }),
      autocompletion({ activateOnTyping: true }),
      keymap.of([
        { key: 'Mod-Enter', run: (target) => { const selection = target.state.selection.main; onRunRef.current(selection.from === selection.to ? undefined : target.state.sliceDoc(selection.from, selection.to)); return true; } },
        { key: 'Mod-Shift-Enter', run: (target) => { const selection = target.state.selection.main; onPlanRef.current(selection.from === selection.to ? undefined : target.state.sliceDoc(selection.from, selection.to)); return true; } },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.contentAttributes.of({ 'aria-label': 'SQL query', 'aria-multiline': 'true' }),
      shortcutHandlers(() => onRunRef.current(), () => onPlanRef.current()),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      editorTheme,
    ]) });
  }, [schema]);

  return <div ref={host} className="sql-editor" aria-label="SQL editor" />;
}
