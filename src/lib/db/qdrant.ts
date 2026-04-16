import { QdrantClient } from '@qdrant/js-client-rest';

// Parse host from URL to avoid "Illegal host" bug in serverless
const qdrantUrl = process.env.QDRANT_URL || '';
let qdrantHost = 'localhost';
let qdrantPort = 6333;
let qdrantHttps = false;

try {
  const parsed = new URL(qdrantUrl);
  qdrantHost = parsed.hostname;
  qdrantPort = parseInt(parsed.port) || 6333;
  qdrantHttps = parsed.protocol === 'https:';
} catch {
  // fallback — use URL directly
}

export const qdrantClient = new QdrantClient({
  host: qdrantHost,
  port: qdrantPort,
  https: qdrantHttps,
  apiKey: process.env.QDRANT_API_KEY,
});

export const COLLECTION_NAME = 'policy_knowledge';
