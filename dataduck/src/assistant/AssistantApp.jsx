import React, { useEffect, useMemo, useRef, useState } from 'react';
import { activeDatasetFingerprint } from '../ai/dataset-fingerprint.js';
import { answerDataQuestion } from '../ai/analyst.js';
import { DEFAULT_GROQ_MODEL, AI_LIMITS } from '../ai/privacy.js';
import { AI_PROVIDERS, DEFAULT_PROVIDER_ID, getActiveProviderConfig, getProviderDefinition, normalizeProviderId, providerIds } from '../ai/providers/registry.js';
import { dailyRequestCount } from '../ai/providers/usage.js';
import { clearProviderKey, loadProviderKey, migrateLegacyGroqKey, saveProviderKey, secureKeyStoreSupported } from '../ai/secure-key-store.js';
import { createThread, deleteThread, listThreads, saveThread, threadIsHistorical } from '../ai/thread-store.js';
import { isNumericSqlType, isTemporalSqlType } from '../duckdb/sql-types.js';
import { DataDuckRuntimeProvider } from './DataDuckRuntime.jsx';
import { AnalysisMessage } from './AnalysisMessage.jsx';

const SETTINGS_KEY = 'dataduck-ai-settings';
const PANEL_WIDE_KEY = 'dataduck-ai-panel-wide';

export const FALLBACK_SUGGESTIONS = [
  'What are the main numeric columns and their ranges?',
  'Show me the top 10 rows by the largest numeric column',
  'Which columns have the most nulls?',
];

export function AssistantApp({ store, queryFn, setSql, showToast, onClose, summaryProvider }) {
  const state = useStoreState(store);
  const [settings, setSettings] = useState(() => readSettings());
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [openPopover, setOpenPopover] = useState(null);
  const [panelWide, setPanelWide] = useState(() => readPanelWide());
  const requestRef = useRef({ id: 0, controller: null });
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

  const currentFingerprint = activeDatasetFingerprint(state);
  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0] || null;
  const historical = threadIsHistorical(activeThread, currentFingerprint);
  const messages = activeThread?.messages || [];

  useEffect(() => {
    let cancelled = false;
    const startingSettings = readSettings();
    Promise.all([listThreads(), maybeLoadRememberedKeys(startingSettings)]).then(([stored, remembered]) => {
      if (cancelled) return;
      const initial = stored.length ? stored : [createThread({ title: 'New analysis', datasetFingerprint: currentFingerprint, tableLabel: state.activeTable })];
      setThreads(initial);
      setActiveThreadId(initial[0]?.id || null);
      setSettings(remembered.settings);
      if (remembered.migrationFailed) {
        showToast?.('Your remembered Groq API key needs to be re-entered.', 'error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
  }, []);

  useEffect(() => {
    writeSettings(settings);
  }, [settings]);

  useEffect(() => {
    writePanelWide(panelWide);
  }, [panelWide]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, running]);

  useEffect(() => {
    if (!openPopover) return undefined;
    function onDoc(event) {
      if (event.target.closest?.('.assistant-popover, .assistant-icon-btn')) return;
      setOpenPopover(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openPopover]);

  function autosizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(160, el.scrollHeight) + 'px';
  }

  async function persistThread(nextThread) {
    await saveThread(nextThread).catch(() => undefined);
    setThreads((items) => [nextThread, ...items.filter((item) => item.id !== nextThread.id)]);
    setActiveThreadId(nextThread.id);
  }

  async function startThread() {
    cancelActiveRequest();
    const thread = createThread({
      title: 'New analysis',
      datasetFingerprint: currentFingerprint,
      tableLabel: state.activeTable,
    });
    await persistThread(thread);
    setOpenPopover(null);
  }

  async function removeThread(id, event) {
    event?.stopPropagation?.();
    cancelActiveRequest();
    await deleteThread(id).catch(() => undefined);
    const next = threads.filter((thread) => thread.id !== id);
    setThreads(next);
    setActiveThreadId(next[0]?.id || null);
  }

  async function submitQuestion(event) {
    event?.preventDefault?.();
    const question = input.trim();
    if (!question || running) return;
    if (!state.activeTable) {
      showToast?.('Open a CSV or Parquet file before asking DataDuck.', 'error');
      return;
    }
    const activeProvider = getActiveProviderConfig(settings);
    if (!activeProvider.apiKey) {
      setOpenPopover('settings');
      showToast?.(`Add a ${activeProvider.provider.label} API key in Settings.`, 'error');
      return;
    }

    const pendingThread = prepareQuestionThread({
      activeThread,
      currentFingerprint,
      activeTable: state.activeTable,
      question,
    });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await persistThread(pendingThread);
    setRunning(true);
    const controller = new AbortController();
    const requestId = requestRef.current.id + 1;
    requestRef.current = { id: requestId, controller };
    const isCurrentRequest = () => requestRef.current.id === requestId && !controller.signal.aborted;
    try {
      const answer = await answerDataQuestion({
        question,
        storeState: store.state,
        getStoreState: () => store.state,
        settings,
        queryFn,
        abortSignal: controller.signal,
      });
      if (!isCurrentRequest()) return;
      await persistThread({
        ...pendingThread,
        messages: [...pendingThread.messages, makeMessage('assistant', answer.text, answer.analysis)],
        updatedAt: Date.now(),
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      if (!isCurrentRequest()) return;
      await persistThread({
        ...pendingThread,
        messages: [...pendingThread.messages, makeMessage('assistant', error?.message || 'Analysis failed.')],
        updatedAt: Date.now(),
      });
    } finally {
      if (requestRef.current.id === requestId) {
        requestRef.current = { id: requestId, controller: null };
        setRunning(false);
      }
    }
  }

  function cancelActiveRequest() {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
    setRunning(false);
  }

  function pickSuggestion(text) {
    setInput(text);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      autosizeTextarea();
    });
  }

  const runtimeSettings = useMemo(() => settings, [settings]);
  const suggestions = buildAssistantSuggestions(state);

  return (
    <DataDuckRuntimeProvider store={store} settings={runtimeSettings} queryFn={queryFn}>
      <section className="assistant-panel" data-panel-size={panelWide ? 'wide' : 'compact'} aria-label="Ask DataDuck">
        <header className="assistant-head">
          <div className="assistant-head-title">
            <div className="assistant-head-text">
              <h2>Ask DataDuck</h2>
              <p title={state.activeTable || ''}>{state.activeTable || 'No file open'}</p>
            </div>
          </div>
          <div className="assistant-head-actions">
            <button
              type="button"
              className="assistant-icon-btn"
              aria-label={panelWide ? 'Use compact panel width' : 'Expand panel width'}
              aria-pressed={panelWide}
              onClick={() => setPanelWide((wide) => !wide)}
              title={panelWide ? 'Use compact panel width' : 'Expand panel width'}
            >
              <Icon name={panelWide ? 'panelCompact' : 'panelWide'} />
            </button>
            <button
              type="button"
              className={`assistant-icon-btn${openPopover === 'history' ? ' is-active' : ''}`}
              aria-label="Conversations"
              aria-pressed={openPopover === 'history'}
              onClick={() => setOpenPopover((p) => (p === 'history' ? null : 'history'))}
              title="Conversations"
            >
              <Icon name="history" />
            </button>
            <button
              type="button"
              className={`assistant-icon-btn${openPopover === 'settings' ? ' is-active' : ''}`}
              aria-label="AI settings"
              aria-pressed={openPopover === 'settings'}
              onClick={() => setOpenPopover((p) => (p === 'settings' ? null : 'settings'))}
              title="AI settings"
            >
              <Icon name="settings" />
            </button>
            <button
              type="button"
              className="assistant-icon-btn"
              aria-label="Close panel"
              onClick={() => onClose?.()}
              title="Close"
            >
              <Icon name="close" />
            </button>
          </div>

          {openPopover === 'history' ? (
            <HistoryPopover
              threads={threads}
              activeId={activeThreadId}
              onPick={(id) => { cancelActiveRequest(); setActiveThreadId(id); setOpenPopover(null); }}
              onNew={startThread}
              onDelete={removeThread}
            />
          ) : null}
          {openPopover === 'settings' ? (
            <SettingsPopover
              settings={settings}
              setSettings={setSettings}
              dailyHint={dailyRequestCopy(settings.providerId)}
              showToast={showToast}
            />
          ) : null}
        </header>

        <div className="assistant-body" ref={messagesRef}>
          {!state.activeTable ? (
            <p className="assistant-empty">Open a CSV or Parquet file in DataDuck, then ask anything about it here.</p>
          ) : null}
          {historical ? (
            <p className="assistant-historical">
              This conversation was created for <strong>{activeThread?.tableLabel || 'another file'}</strong>. New questions will use the current active file.
            </p>
          ) : null}
          {state.activeTable && messages.length === 0 ? (
            <div className="assistant-suggestions">
              <span className="assistant-suggestions-label">Try asking</span>
              {suggestions.map((text) => (
                <button key={text} type="button" className="assistant-suggestion" onClick={() => pickSuggestion(text)}>
                  {text}
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              settings={settings}
              onOpenSql={setSql}
              onCopySql={(sql) => copyText(sql, showToast)}
              summaryProvider={summaryProvider}
            />
          ))}
          {running ? (
            <div className="assistant-msg assistant">
              <span className="assistant-msg-avatar" aria-hidden="true"><DuckMark /></span>
              <div className="assistant-msg-bubble">
                <span className="assistant-typing" aria-label="Analyzing">
                  <span></span><span></span><span></span>
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <form className="assistant-composer" onSubmit={submitQuestion}>
          <div className="assistant-dataset-chip" title={state.activeTable || 'No file'}>
            <span className="dot" aria-hidden="true" />
            <span className="name">{state.activeTable || 'no file'}</span>
            <span className="mode">Schema only</span>
          </div>
          <div className="assistant-composer-card">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => { setInput(event.target.value); autosizeTextarea(); }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitQuestion(event);
              }}
              placeholder={state.activeTable ? `Ask about ${state.activeTable}…` : 'Open a CSV or Parquet file first'}
              disabled={!state.activeTable || running}
              rows={3}
            />
            <div className="assistant-composer-actions">
              <span className="assistant-composer-hint">
                <kbd>⌘</kbd><kbd>↵</kbd> send · stays local in DuckDB-WASM
              </span>
              <button type="submit" className="assistant-send" disabled={!state.activeTable || running || !input.trim()} aria-label="Send">
                {running ? <span className="assistant-spinner" /> : <Icon name="send" />}
              </button>
            </div>
          </div>
        </form>
      </section>
    </DataDuckRuntimeProvider>
  );
}

function Message({ message, settings, onOpenSql, onCopySql, summaryProvider }) {
  const isUser = message.role === 'user';
  if (isUser) {
    return (
      <div className="assistant-msg user">
        <div className="assistant-msg-bubble">
          <p>{message.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="assistant-msg assistant">
      <span className="assistant-msg-avatar" aria-hidden="true"><DuckMark /></span>
      <div className="assistant-msg-bubble">
        {message.text ? <p>{message.text}</p> : null}
        {message.analysis ? (
          <AnalysisMessage
            analysis={message.analysis}
            settings={settings}
            onOpenSql={onOpenSql}
            onCopySql={onCopySql}
            summaryProvider={summaryProvider}
          />
        ) : null}
      </div>
    </div>
  );
}

function HistoryPopover({ threads, activeId, onPick, onNew, onDelete }) {
  return (
    <div className="assistant-popover assistant-popover-history" role="dialog" aria-label="Conversations">
      <div className="assistant-popover-row">
        <h4>Conversations</h4>
        <button type="button" className="assistant-icon-btn" onClick={onNew} aria-label="New conversation" title="New conversation">
          <Icon name="plus" />
        </button>
      </div>
      <div className="assistant-thread-list">
        {threads.length === 0 ? (
          <p className="assistant-muted">No previous conversations.</p>
        ) : threads.map((thread) => (
          <button
            type="button"
            key={thread.id}
            className={`assistant-thread-row${thread.id === activeId ? ' is-active' : ''}`}
            onClick={() => onPick(thread.id)}
          >
            <span className="assistant-thread-text">
              <span>{thread.title || 'Untitled'}</span>
              <small>{thread.tableLabel || 'DataDuck'}</small>
            </span>
            <span
              className="assistant-thread-del"
              role="button"
              tabIndex={-1}
              aria-label="Delete conversation"
              onClick={(event) => onDelete(thread.id, event)}
            >×</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsPopover({ settings, setSettings, dailyHint, showToast }) {
  const supported = secureKeyStoreSupported();
  const active = getActiveProviderConfig(settings);
  const provider = active.provider;

  async function updateRemember(rememberKey) {
    setSettings((next) => ({ ...next, rememberKey }));
    if (!supported) return;
    if (!rememberKey) {
      await Promise.all(providerIds().map((providerId) => clearProviderKey(providerId).catch(() => undefined)));
      return;
    }
    await Promise.all(providerIds().map((providerId) => {
      const key = settings.providers?.[providerId]?.apiKey || '';
      return key ? saveProviderKey(providerId, key).catch(() => undefined) : Promise.resolve();
    }));
  }

  async function updateKey(apiKey) {
    setSettings((next) => updateProviderSettings(next, active.providerId, { apiKey }));
    if (settings.rememberKey && supported) await saveProviderKey(active.providerId, apiKey).catch(() => undefined);
  }

  function updateModel(model) {
    if (looksLikeApiKey(model)) {
      showToast?.('That looks like an API key. Paste it in the API key field.', 'error');
      return;
    }
    setSettings((next) => updateProviderSettings(next, active.providerId, { model }));
  }

  function updateProvider(providerId) {
    setSettings((next) => ({ ...normalizeSettingsShape(next), providerId: normalizeProviderId(providerId) }));
  }

  return (
    <div className="assistant-popover" role="dialog" aria-label="AI settings">
      <h4>AI provider</h4>
      <label>
        <span>Provider</span>
        <select value={active.providerId} onChange={(event) => updateProvider(event.target.value)}>
          {providerIds().map((providerId) => {
            const option = getProviderDefinition(providerId);
            return <option key={providerId} value={providerId}>{option.label}</option>;
          })}
        </select>
      </label>
      <label>
        <span>{provider.keyLabel}</span>
        <input
          type="password"
          value={active.apiKey}
          onChange={(event) => updateKey(event.target.value)}
          placeholder={provider.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        <span>Model</span>
        <input
          type="text"
          value={active.model}
          onChange={(event) => updateModel(event.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="assistant-popover-check">
        <input
          type="checkbox"
          checked={settings.rememberKey && supported}
          disabled={!supported}
          onChange={(event) => updateRemember(event.target.checked)}
        />
        <span>Remember key on this browser</span>
      </label>
      <p className="assistant-muted">
        Stored locally with WebCrypto + IndexedDB. Not protection against same-origin script compromise.
      </p>
      {dailyHint ? <p className="assistant-muted assistant-muted-strong">{dailyHint}</p> : null}
    </div>
  );
}

function DuckMark() {
  return (
    <svg viewBox="0 0 823 675" fill="currentColor" aria-hidden="true">
      <path d="M406 312 C407 276.1 377.6 294.1 368 297 C358.4 299.9 338.9 329.2 329 335 C319.1 340.8 300.8 346.4 289 343 C277.2 339.6 245.4 312.2 235 308 C224.6 303.8 211.9 306.6 206 309 C200.1 311.4 192 317.1 188 327 C184 336.9 180 377.5 174 388 C168 398.5 151.5 408 140 411 C128.5 414 91 407.1 82 412 C73 416.9 42.4 425 68 450 C93.6 475 254 591.4 287 612 C320 632.6 322.9 618.5 332 615 C341.1 611.5 350.8 621.9 360 584 C369.2 546.1 405 347.9 406 312 Z" />
      <path d="M606 112 C599.5 110.5 585.5 110.5 575 116 C564.5 121.5 532.6 151.5 522 156 C511.4 160.5 500 156.9 490 152 C480 147.1 452.2 118.8 442 117 C431.8 115.2 402.9 102.4 408 138 C413.1 173.6 469.6 365.5 483 402 C496.4 438.5 505.2 427.8 515 430 C524.8 432.2 530.5 444 561 420 C591.5 396 736.6 265.4 759 238 C781.4 210.6 749.1 204.9 740 201 C730.9 197.1 697 208.1 686 207 C675 205.9 659.4 201.9 652 192 C644.6 182.1 632.8 138 627 128 C621.2 118 612.5 113.5 606 112 Z" />
    </svg>
  );
}

function Icon({ name }) {
  const paths = {
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    panelCompact: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M15 5v14" /><path d="m9 9 3 3-3 3" /></>,
    panelWide: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M13 5v14" /><path d="m17 9-3 3 3 3" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function useStoreState(store) {
  const [, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((version) => version + 1)), [store]);
  return store.state;
}

const LEGACY_DEFAULT_MODELS = new Set(['openai/gpt-oss-20b']);

function readSettings() {
  let stored = null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  if (stored?.providerId) return normalizeSettingsShape(stored);
  const hasLegacySettings = stored &&
    (Object.prototype.hasOwnProperty.call(stored, 'model') ||
      Object.prototype.hasOwnProperty.call(stored, 'rememberKey'));
  if (hasLegacySettings) {
    const storedModel = stored.model;
    const model = !storedModel || LEGACY_DEFAULT_MODELS.has(storedModel) ? DEFAULT_GROQ_MODEL : storedModel;
    return normalizeSettingsShape({
      providerId: 'groq',
      rememberKey: Boolean(stored.rememberKey),
      providers: {
        groq: { model },
      },
    });
  }
  return normalizeSettingsShape({
    providerId: DEFAULT_PROVIDER_ID,
    rememberKey: false,
  });
}

function writeSettings(settings) {
  const normalized = normalizeSettingsShape(settings);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      providerId: normalized.providerId,
      rememberKey: Boolean(normalized.rememberKey),
      providers: Object.fromEntries(providerIds().map((providerId) => [
        providerId,
        { model: normalized.providers[providerId]?.model || AI_PROVIDERS[providerId].defaultModel },
      ])),
    }));
  } catch {
    // ignore private mode quota errors
  }
}

function normalizeSettingsShape(settings = {}) {
  const providerId = normalizeProviderId(settings.providerId);
  const providers = {};
  for (const providerIdValue of providerIds()) {
    providers[providerIdValue] = {
      model: AI_PROVIDERS[providerIdValue].defaultModel,
      apiKey: '',
      ...(settings.providers?.[providerIdValue] || {}),
    };
  }
  if (settings.apiKey || settings.model) {
    providers.groq = {
      ...providers.groq,
      apiKey: settings.apiKey || providers.groq.apiKey || '',
      model: settings.model || providers.groq.model || DEFAULT_GROQ_MODEL,
    };
  }
  return {
    providerId,
    rememberKey: Boolean(settings.rememberKey),
    providers,
  };
}

function updateProviderSettings(settings, providerId, patch) {
  const normalized = normalizeSettingsShape(settings);
  const id = normalizeProviderId(providerId);
  return {
    ...normalized,
    providers: {
      ...normalized.providers,
      [id]: {
        ...normalized.providers[id],
        ...patch,
      },
    },
  };
}

function looksLikeApiKey(value) {
  return /^(sk-ant-|sk-|gsk_)/i.test(String(value || '').trim());
}

function readPanelWide() {
  try {
    return localStorage.getItem(PANEL_WIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePanelWide(wide) {
  try {
    localStorage.setItem(PANEL_WIDE_KEY, wide ? '1' : '0');
  } catch {
    // ignore private mode quota errors
  }
}

async function maybeLoadRememberedKeys(settings) {
  const normalized = normalizeSettingsShape(settings);
  if (!normalized.rememberKey || !secureKeyStoreSupported()) return { settings: normalized, migrationFailed: false };
  const migration = await migrateLegacyGroqKey().catch((error) => ({ status: 'failed', error }));
  const providers = { ...normalized.providers };
  await Promise.all(providerIds().map(async (providerId) => {
    const key = await loadProviderKey(providerId).catch(() => '');
    if (key) providers[providerId] = { ...providers[providerId], apiKey: key };
  }));
  return {
    settings: { ...normalized, providers },
    migrationFailed: migration?.status === 'failed',
  };
}

export function buildAssistantSuggestions(state = {}) {
  const record = state.activeTable ? state.files?.get?.(state.activeTable) : null;
  const schema = Array.isArray(record?.profile?.schema) ? record.profile.schema : [];
  const columns = schema
    .map((row) => ({
      name: String(row.column_name || row.name || '').trim(),
      type: String(row.column_type || row.type || '').trim(),
    }))
    .filter((column) => column.name);
  if (!columns.length) return FALLBACK_SUGGESTIONS;

  const numeric = columns.filter((column) => isNumericSqlType(column.type));
  const temporal = columns.filter((column) => isTemporalSqlType(column.type));
  const categorical = columns.filter((column) => isCategoricalSqlType(column.type));
  const summary = record?.summary instanceof Map ? record.summary : new Map();
  const suggestions = [];

  const metric = pickMetric(numeric);
  const secondMetric = numeric.find((column) => column.name !== metric?.name);
  const date = pickColumn(temporal, ['date', 'time', 'created', 'updated']);
  const category = pickColumn(categorical, ['region', 'category', 'channel', 'status', 'segment', 'product']);
  const nullable = columns
    .map((column) => ({ ...column, nullCount: Number(summary.get(column.name)?.nullCount || 0) }))
    .filter((column) => column.nullCount > 0)
    .sort((a, b) => b.nullCount - a.nullCount);

  if (category && metric) suggestions.push(`Which ${category.name} values have the highest average ${metric.name}?`);
  if (date && metric) suggestions.push(`How does ${metric.name} change over ${date.name}?`);
  if (nullable.length) suggestions.push(`Which columns have missing values, especially ${listNames(nullable.slice(0, 2))}?`);
  if (metric && secondMetric) suggestions.push(`Compare the ranges and outliers for ${listNames([metric, secondMetric])}.`);
  if (metric) suggestions.push(`Show the top 10 rows by ${metric.name}.`);

  return withFallbackSuggestions(suggestions);
}

function withFallbackSuggestions(items) {
  const unique = [];
  for (const item of [...items, ...FALLBACK_SUGGESTIONS]) {
    if (item && !unique.includes(item)) unique.push(item);
    if (unique.length === 3) break;
  }
  return unique;
}

function isCategoricalSqlType(type) {
  return /^(VARCHAR|TEXT|STRING|CHAR|BOOLEAN|BOOL)\b/i.test(type);
}

function pickColumn(columns, preferredTerms = []) {
  return preferredTerms
    .map((term) => columns.find((column) => column.name.toLowerCase().includes(term)))
    .find(Boolean) || columns[0] || null;
}

function pickMetric(columns) {
  return pickColumn(columns, ['total', 'amount', 'revenue', 'sales', 'price', 'quantity', 'count']) || columns[0] || null;
}

function listNames(columns) {
  return columns.map((column) => column.name).join(' and ');
}

export function prepareQuestionThread({
  activeThread = null,
  currentFingerprint = null,
  activeTable = null,
  question = '',
  now = () => Date.now(),
  randomUUID = () => crypto?.randomUUID?.(),
} = {}) {
  const useExisting = activeThread && !threadIsHistorical(activeThread, currentFingerprint);
  const baseThread = useExisting
    ? activeThread
    : createThread({
        datasetFingerprint: currentFingerprint,
        tableLabel: activeTable,
        now,
        randomUUID,
      });
  const userMessage = makeMessage('user', question, null, { now, randomUUID });
  return {
    ...baseThread,
    title: baseThread.messages.length ? baseThread.title : titleFromQuestion(question),
    datasetFingerprint: useExisting ? baseThread.datasetFingerprint || currentFingerprint : currentFingerprint,
    tableLabel: useExisting ? baseThread.tableLabel || activeTable : activeTable,
    messages: [...(useExisting ? baseThread.messages : []), userMessage],
    updatedAt: now(),
  };
}

function makeMessage(role, text, analysis = null, { now = () => Date.now(), randomUUID = () => crypto?.randomUUID?.() } = {}) {
  return {
    id: randomUUID?.() || `msg_${now()}_${Math.random().toString(16).slice(2)}`,
    role,
    text,
    analysis,
    createdAt: now(),
  };
}

function titleFromQuestion(question) {
  return question.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New analysis';
}

function dailyRequestCopy(providerId) {
  const id = normalizeProviderId(providerId);
  const count = dailyRequestCount(id);
  const label = getProviderDefinition(id).label;
  return count >= AI_LIMITS.dailyRequestWarning ? `${count} ${label} calls today` : null;
}

async function copyText(text, showToast) {
  try {
    await navigator.clipboard?.writeText?.(text);
    showToast?.('SQL copied.');
  } catch {
    showToast?.('Could not copy SQL.', 'error');
  }
}
