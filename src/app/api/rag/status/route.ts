import { isEmbeddingReady, isEmbeddingInitializing } from '@/lib/ai/rag';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ready: isEmbeddingReady(),
    initializing: isEmbeddingInitializing(),
  });
}
