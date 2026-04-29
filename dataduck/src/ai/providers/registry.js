import { DEFAULT_AI_PROVIDER, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GROQ_MODEL } from '../privacy.js';
import { anthropicAdapter } from './anthropic.js';
import { groqAdapter } from './openai-compat.js';

export const AI_PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    keyLabel: 'Claude API key',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
    adapter: anthropicAdapter,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    keyLabel: 'Groq API key',
    keyPlaceholder: 'gsk_...',
    defaultModel: DEFAULT_GROQ_MODEL,
    adapter: groqAdapter,
  },
};

export const DEFAULT_PROVIDER_ID = DEFAULT_AI_PROVIDER;

export function providerIds() {
  return Object.keys(AI_PROVIDERS);
}

export function normalizeProviderId(providerId) {
  const id = String(providerId || '').trim();
  return AI_PROVIDERS[id] ? id : DEFAULT_PROVIDER_ID;
}

export function getProviderDefinition(providerId) {
  const normalized = normalizeProviderId(providerId);
  return AI_PROVIDERS[normalized];
}

export function ensureProviderSettings(settings = {}) {
  const legacyGroqShape = !settings.providerId && (settings.apiKey || settings.model);
  const providerId = normalizeProviderId(legacyGroqShape ? 'groq' : settings.providerId);
  const providers = { ...settings.providers };
  for (const id of providerIds()) {
    providers[id] = {
      model: AI_PROVIDERS[id].defaultModel,
      apiKey: '',
      ...(providers[id] || {}),
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

export function getActiveProviderConfig(settings = {}) {
  const normalized = ensureProviderSettings(settings);
  const provider = getProviderDefinition(normalized.providerId);
  const providerSettings = normalized.providers[provider.id] || {};
  return {
    provider,
    providerId: provider.id,
    apiKey: providerSettings.apiKey || '',
    model: providerSettings.model || provider.defaultModel,
  };
}

export async function callProviderJson({ settings = {}, ...options } = {}) {
  const active = getActiveProviderConfig(settings);
  return active.provider.adapter.callJson({
    ...options,
    jsonSchema: schemaForProvider(active.provider.id, options),
    apiKey: active.apiKey,
    model: active.model,
  });
}

export async function callProviderText({ settings = {}, ...options } = {}) {
  const active = getActiveProviderConfig(settings);
  return active.provider.adapter.callText({
    ...options,
    apiKey: active.apiKey,
    model: active.model,
  });
}

function schemaForProvider(providerId, options = {}) {
  if (providerId === 'anthropic' && options.anthropicJsonSchema) return options.anthropicJsonSchema;
  return options.jsonSchema;
}
