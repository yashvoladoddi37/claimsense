// ============================================================
// Gemini Client Setup
// Supports runtime API key configuration via setApiKey()
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

// Runtime key takes precedence over env key
let runtimeApiKey: string | null = null;

function getActiveKey(): string | null {
  return runtimeApiKey || process.env.GEMINI_API_KEY || null;
}

function getClient(): GoogleGenerativeAI | null {
  const key = getActiveKey();
  return key ? new GoogleGenerativeAI(key) : null;
}

/** Set API key at runtime (from Settings page) */
export function setApiKey(key: string | null) {
  runtimeApiKey = key;
}

/** Get the current API key source info (masked) */
export function getApiKeyInfo(): { configured: boolean; source: 'runtime' | 'env' | 'none'; maskedKey: string | null } {
  if (runtimeApiKey) {
    return {
      configured: true,
      source: 'runtime',
      maskedKey: runtimeApiKey.slice(0, 4) + '••••' + runtimeApiKey.slice(-4),
    };
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return {
      configured: true,
      source: 'env',
      maskedKey: envKey.slice(0, 4) + '••••' + envKey.slice(-4),
    };
  }
  return { configured: false, source: 'none', maskedKey: null };
}

/** Chat/generation model — Gemini 2.5 Flash for speed + vision */
export function getGenerativeModel() {
  const client = getClient();
  if (!client) throw new Error('GEMINI_API_KEY not configured');
  return client.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

/** Embedding model for RAG */
export function getEmbeddingModel() {
  const client = getClient();
  if (!client) throw new Error('GEMINI_API_KEY not configured');
  return client.getGenerativeModel({ model: 'gemini-embedding-001' });
}

export function isAIAvailable(): boolean {
  return !!getActiveKey();
}

/** Check if the agentic pipeline (Groq) is available */
export function isAgentAvailable(): boolean {
  return !!process.env.GROQ_API_KEY;
}
