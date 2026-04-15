// GET /api/rag — Get knowledge base stats and chunks
// POST /api/rag — Query the knowledge base (search)

import { NextRequest } from 'next/server';
import { getKnowledgeBaseStats, retrieveContext, formatRetrievedContext, initializeKnowledgeBase } from '@/lib/ai/rag';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initializeKnowledgeBase();
    const stats = getKnowledgeBaseStats();
    return Response.json(stats);
  } catch (error) {
    console.error('RAG stats error:', error);
    return Response.json({ error: 'Failed to get RAG stats' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query, topK = 5, source } = await request.json();

    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Query string required' }, { status: 400 });
    }

    const results = await retrieveContext(query, topK, source);
    const formatted = formatRetrievedContext(results);

    return Response.json({
      query,
      results: results.map(r => ({
        source: r.chunk.source,
        category: r.chunk.category,
        text: r.chunk.text,
        similarity: r.similarity,
      })),
      formatted_context: formatted,
    });
  } catch (error) {
    console.error('RAG query error:', error);
    return Response.json({ error: 'Failed to query RAG' }, { status: 500 });
  }
}
