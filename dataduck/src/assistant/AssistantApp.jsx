import React, { useEffect, useMemo, useRef, useState } from 'react';
import { activeDatasetFingerprint } from '../ai/dataset-fingerprint.js';
import { answerDataQuestion } from '../ai/analyst.js';
import { DEFAULT_GROQ_MODEL, GROQ_LIMITS } from '../ai/privacy.js';
import { clearGroqKey, loadGroqKey, saveGroqKey, secureKeyStoreSupported } from '../ai/secure-key-store.js';
import { createThread, deleteThread, listThreads, saveThread, threadIsHistorical } from '../ai/thread-store.js';
import { DataDuckRuntimeProvider } from './DataDuckRuntime.jsx';
import { AnalysisMessage } from './AnalysisMessage.jsx';

const SETTINGS_KEY = 'dataduck-ai-settings';

export function AssistantApp({ store, queryFn, setSql, showToast }) {
  const state = useStoreState(store);
  const [settings, setSettings] = useState(() => readSettings());
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const requestRef = useRef({ id: 0, controller: null });

  const currentFingerprint = activeDatasetFingerprint(state);
  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0] || null;
  const historical = threadIsHistorical(activeThread, currentFingerprint);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listThreads(), maybeLoadRememberedKey()]).then(([stored, key]) => {
      if (cancelled) return;
      const initial = stored.length ? stored : [createThread({ title: 'New analysis', datasetFingerprint: currentFingerprint, tableLabel: state.activeTable })];
      setThreads(initial);
      setActiveThreadId(initial[0]?.id || null);
      if (key) setSettings((next) => ({ ...next, apiKey: key }));
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
  }, [settings.model, settings.rememberKey]);

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
  }

  async function removeThread(id) {
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
    if (!settings.apiKey) {
      showToast?.('Add a Groq API key in Ask DataDuck settings.', 'error');
      return;
    }

    const pendingThread = prepareQuestionThread({
      activeThread,
      currentFingerprint,
      activeTable: state.activeTable,
      question,
    });
    setInput('');
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

  const runtimeSettings = useMemo(() => settings, [settings.apiKey, settings.model]);

  return (
    <DataDuckRuntimeProvider store={store} settings={runtimeSettings} queryFn={queryFn}>
      <section className="assistant-panel" aria-label="Ask DataDuck">
        <aside className="assistant-threads">
          <div className="assistant-brand">
            <strong>Ask DataDuck</strong>
            <span>{state.activeTable || 'No active file'}</span>
          </div>
          <button type="button" className="assistant-new" onClick={startThread}>+ New chat</button>
          <div className="assistant-thread-list">
            {threads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className={thread.id === activeThreadId ? 'is-active' : ''}
                onClick={() => {
                  cancelActiveRequest();
                  setActiveThreadId(thread.id);
                }}
              >
                <span>{thread.title}</span>
                <small>{thread.tableLabel || 'DataDuck'}</small>
                <i onClick={(event) => { event.stopPropagation(); removeThread(thread.id); }}>×</i>
              </button>
            ))}
          </div>
        </aside>
        <main className="assistant-main">
          <AssistantSettings settings={settings} setSettings={setSettings} />
          {!state.activeTable ? <p className="assistant-empty">Open a CSV or Parquet file to ask questions.</p> : null}
          {historical ? (
            <p className="assistant-historical">
              This conversation was created for {activeThread?.tableLabel || 'another file'}. New questions will use the current active file.
            </p>
          ) : null}
          <div className="assistant-messages">
            {(activeThread?.messages || []).map((message) => (
              <div key={message.id} className={`assistant-msg ${message.role}`}>
                <p>{message.text}</p>
                {message.analysis ? (
                  <AnalysisMessage
                    analysis={message.analysis}
                    settings={settings}
                    onOpenSql={setSql}
                    onCopySql={(sql) => copyText(sql, showToast)}
                  />
                ) : null}
              </div>
            ))}
            {running ? <div className="assistant-msg assistant"><p>Analyzing with local DuckDB execution...</p></div> : null}
          </div>
          <form className="assistant-composer" onSubmit={submitQuestion}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitQuestion(event);
              }}
              placeholder={state.activeTable ? 'Ask about the active file...' : 'Open a file first'}
              disabled={!state.activeTable || running}
              rows={2}
            />
            <button type="submit" disabled={!state.activeTable || running || !input.trim()}>Send</button>
          </form>
        </main>
      </section>
    </DataDuckRuntimeProvider>
  );
}

function AssistantSettings({ settings, setSettings }) {
  const [open, setOpen] = useState(false);
  const supported = secureKeyStoreSupported();

  async function updateRemember(rememberKey) {
    setSettings((next) => ({ ...next, rememberKey }));
    if (!rememberKey) await clearGroqKey().catch(() => undefined);
    if (rememberKey && settings.apiKey && supported) await saveGroqKey(settings.apiKey).catch(() => undefined);
  }

  async function updateKey(apiKey) {
    setSettings((next) => ({ ...next, apiKey }));
    if (settings.rememberKey && supported) await saveGroqKey(apiKey).catch(() => undefined);
  }

  return (
    <div className="assistant-settings">
      <button type="button" onClick={() => setOpen((value) => !value)}>AI settings</button>
      <span>Schema-only by default</span>
      {dailyRequestCopy()}
      {open ? (
        <div className="assistant-settings-panel">
          <label>
            Groq API key
            <input type="password" value={settings.apiKey} onChange={(event) => updateKey(event.target.value)} placeholder="gsk_..." />
          </label>
          <label>
            Model
            <input value={settings.model} onChange={(event) => setSettings((next) => ({ ...next, model: event.target.value }))} />
          </label>
          <label className="assistant-check">
            <input type="checkbox" checked={settings.rememberKey && supported} disabled={!supported} onChange={(event) => updateRemember(event.target.checked)} />
            Remember key on this browser
          </label>
          <p className="assistant-muted">Stored locally with WebCrypto/IndexedDB. This is not protection against same-origin script compromise.</p>
        </div>
      ) : null}
    </div>
  );
}

function useStoreState(store) {
  const [, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((version) => version + 1)), [store]);
  return store.state;
}

function readSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  return {
    apiKey: '',
    model: stored.model || DEFAULT_GROQ_MODEL,
    rememberKey: Boolean(stored.rememberKey),
  };
}

function writeSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      model: settings.model || DEFAULT_GROQ_MODEL,
      rememberKey: Boolean(settings.rememberKey),
    }));
  } catch {
    // ignore private mode quota errors
  }
}

async function maybeLoadRememberedKey() {
  const settings = readSettings();
  if (!settings.rememberKey || !secureKeyStoreSupported()) return '';
  return loadGroqKey().catch(() => '');
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

function dailyRequestCopy() {
  let count = 0;
  try {
    const payload = JSON.parse(localStorage.getItem('dataduck:groq-daily-requests') || '{}');
    const day = new Date().toISOString().slice(0, 10);
    count = payload.day === day ? Number(payload.count) || 0 : 0;
  } catch {
    count = 0;
  }
  return count >= GROQ_LIMITS.dailyRequestWarning ? <b>{count} Groq calls today</b> : null;
}

async function copyText(text, showToast) {
  try {
    await navigator.clipboard?.writeText?.(text);
    showToast?.('SQL copied.');
  } catch {
    showToast?.('Could not copy SQL.', 'error');
  }
}
