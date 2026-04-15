// GET /api/settings — Get current AI configuration status
// POST /api/settings — Update API key at runtime

import { NextRequest } from 'next/server';
import { isGroqAvailable, groqGenerate, GROQ_MODEL } from '@/lib/ai/groq';
import { isAIAvailable, getApiKeyInfo } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

function getGroqKeysInfo() {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ];
  const configured = keys.filter(Boolean);
  return {
    configured: configured.length > 0,
    count: configured.length,
    maskedKeys: configured.map((k) => k!.slice(0, 4) + '••••' + k!.slice(-4)),
  };
}

export async function GET() {
  const groqInfo = getGroqKeysInfo();
  const geminiInfo = getApiKeyInfo();
  return Response.json({
    groq: {
      available: isGroqAvailable(),
      model: GROQ_MODEL,
      keyCount: groqInfo.count,
      maskedKeys: groqInfo.maskedKeys,
    },
    gemini: {
      available: isAIAvailable(),
      source: geminiInfo.source,
      maskedKey: geminiInfo.maskedKey,
    },
    embeddings: {
      model: 'all-MiniLM-L6-v2 (local)',
      status: 'active',
    },
    database: {
      url: process.env.TURSO_DATABASE_URL === 'file:local.db' ? 'SQLite (local file)' : 'Turso Cloud',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { api_key, action } = body;

    if (action === 'clear') {
      delete process.env.GROQ_API_KEY;
      return Response.json({
        success: true,
        message: 'Groq API key cleared.',
      });
    }

    if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
      return Response.json(
        { success: false, error: 'Invalid API key format.' },
        { status: 400 }
      );
    }

    const trimmedKey = api_key.trim();

    // Test the key by making a lightweight call
    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = trimmedKey;
    try {
      const text = await groqGenerate('Respond with exactly: OK', { maxOutputTokens: 10 });
      if (!text) throw new Error('Empty response from Groq');
    } catch (err) {
      if (prevKey) process.env.GROQ_API_KEY = prevKey;
      else delete process.env.GROQ_API_KEY;
      return Response.json(
        { success: false, error: `API key validation failed: ${String(err).slice(0, 200)}` },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      message: 'Groq API key configured and verified!',
    });
  } catch (error) {
    return Response.json(
      { success: false, error: `Failed to update settings: ${String(error)}` },
      { status: 500 }
    );
  }
}
