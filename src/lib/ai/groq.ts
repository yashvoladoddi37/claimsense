import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

// GROQ_MODEL env var to switch between models:
//   meta-llama/llama-4-scout-17b-16e-instruct — recommended: 30K TPM, 131k ctx, tool calling
//   groq/compound-mini      — 70K TPM but NO tool calling (text-only tasks)
//   openai/gpt-oss-20b      — 8K TPM, 131k context, tool use
//   qwen/qwen3-32b          — 6K TPM, 131k context
//   llama-3.3-70b-versatile — best quality but low limits
//   llama-3.1-8b-instant    — fast but 6K TPM
export const GROQ_MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

// Fetch all available Groq API keys from environment
const getApiKeys = () => {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter(Boolean) as string[];
  return keys;
};

let currentKeyIndex = 0;

/**
 * Returns a Groq provider instance for the currently active API key.
 */
export function getGroqProvider() {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error('No GROQ_API_KEY configured');
  
  // Wrap index to stay within bounds
  const index = currentKeyIndex % keys.length;
  return createGroq({ apiKey: keys[index] });
}

export function isGroqAvailable(): boolean {
  return getApiKeys().length > 0;
}

/**
 * Helper to rotate to the next API key.
 */
export function rotateGroqKey() {
  const keys = getApiKeys();
  if (keys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    console.log(`🔄 Rotated Groq API key to index ${currentKeyIndex}`);
  }
}

/**
 * Wrapper for Groq calls that handles automatic rotation on rate limits (429).
 */
export async function withGroqRotation<T>(
  operation: (provider: ReturnType<typeof createGroq>) => Promise<T>,
  onRetry?: (message: string) => void
): Promise<T> {
  const keys = getApiKeys();
  // Cycle through all keys, then do a second pass with delays for TPM cooldown
  const maxAttempts = keys.length * 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const provider = getGroqProvider();
      return await operation(provider);
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      const status = error?.status || error?.statusCode;

      const isRateLimit =
        status === 429 ||
        status === 413 ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('rate_limit') ||
        msg.includes('quota') ||
        msg.includes('exceeded') ||
        msg.includes('resource_exhausted') ||
        msg.includes('tokens per') ||
        msg.includes('requests per');

      const isNetworkError =
        msg.includes('timeout') ||
        msg.includes('connect') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('fetch failed') ||
        msg.includes('network');

      if (attempt < maxAttempts - 1) {
        if (isRateLimit) {
          // Extract retry-after from error response headers if available
          const retryAfter = error?.responseHeaders?.['retry-after'];
          const completedFirstPass = attempt >= keys.length - 1;

          if (completedFirstPass) {
            // All keys tried once — wait for TPM cooldown before second pass
            const waitSec = retryAfter ? Math.min(parseInt(retryAfter, 10), 20) : 10;
            console.warn(`⚠️ All keys exhausted (attempt ${attempt + 1}/${maxAttempts}). Waiting ${waitSec}s for TPM cooldown...`);
            onRetry?.(`All API keys rate-limited — waiting ${waitSec}s for cooldown...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
          } else {
            console.warn(`⚠️ Groq limit hit (attempt ${attempt + 1}/${maxAttempts}): ${msg.slice(0, 100)}. Rotating key...`);
            onRetry?.('API rate limit hit — trying next key...');
          }
          rotateGroqKey();
          continue;
        }
        if (isNetworkError) {
          const delay = 1000 * (attempt + 1);
          console.warn(`⚠️ Groq network error (attempt ${attempt + 1}/${maxAttempts}): ${msg.slice(0, 100)}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error('Groq rotation failed — all attempts exhausted');
}

/**
 * Generate text using Groq/Llama. Returns the raw text response.
 * Automatically handles key rotation on rate limits.
 */
export async function groqGenerate(prompt: string, options?: { temperature?: number; maxOutputTokens?: number }): Promise<string> {
  return withGroqRotation(async (groq) => {
    const result = await generateText({
      model: groq(GROQ_MODEL),
      prompt,
      temperature: options?.temperature ?? 0.2,
      maxOutputTokens: options?.maxOutputTokens ?? 2048,
      maxRetries: 0, // Disable SDK retry — our rotation handles retries across keys
    });
    return result.text;
  });
}

/**
 * Generate structured JSON using Groq/Llama.
 * Wraps the prompt with JSON-output instructions and parses the response.
 */
/** Fix invalid escape sequences that LLMs sometimes produce in JSON */
function sanitizeJsonString(raw: string): string {
  // Fix invalid escapes like \: \' \/ etc. — only \", \\, \/, \b, \f, \n, \r, \t, \uXXXX are valid
  return raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

function tryParseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(sanitizeJsonString(raw));
  }
}

export async function groqGenerateJSON<T = Record<string, unknown>>(prompt: string, options?: { temperature?: number }): Promise<T> {
  const wrappedPrompt = `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no code blocks, no explanation — just the JSON object.`;
  const text = await groqGenerate(wrappedPrompt, { temperature: options?.temperature ?? 0.1, maxOutputTokens: 4096 });

  // Try direct parse first, then try extracting from code blocks
  try {
    return tryParseJson<T>(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return tryParseJson<T>(jsonMatch[1]);
    }
    // Try to find the first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return tryParseJson<T>(braceMatch[0]);
    }
    throw new Error(`Failed to parse JSON from Groq response: ${text.slice(0, 200)}`);
  }
}
