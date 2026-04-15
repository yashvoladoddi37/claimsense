// POST /api/rag/ask — Natural language Q&A about policy using RAG + Groq/Llama

import { NextRequest } from 'next/server';
import { retrieveContext, formatRetrievedContext } from '@/lib/ai/rag';
import { isGroqAvailable, groqGenerate } from '@/lib/ai/groq';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== 'string') {
      return Response.json({ error: 'Question string required' }, { status: 400 });
    }

    // Retrieve relevant context
    const results = await retrieveContext(question, 5);
    const ragContext = formatRetrievedContext(results);

    // If Groq is available, generate a natural language answer
    let answer = '';
    if (isGroqAvailable()) {
      const prompt = `You are a concise insurance policy assistant for the OPD Advantage plan. Answer questions based ONLY on the policy context below.

ANSWER FORMAT — follow this strictly:
1. **Lead with the fact.** Start your answer with the specific number, amount, yes/no, or key detail the user is asking about. No greetings, no filler, no "I'd be happy to help". Just the answer.
   - Example: "The per-claim limit is **₹5,000**." NOT "Yes, I'd be happy to help with that. The per-claim limit is..."
   - Example: "**No**, teeth whitening is not covered." NOT "I understand your concern, and I'm happy to help..."
   - Example: "**90 days.** Diabetes has a 90-day waiting period..." NOT "Yes, I'd be happy to help. The waiting period for diabetes is 90 days..."
2. **Then explain briefly** — 2-3 sentences max covering the reasoning or relevant conditions.
3. **Bold** key terms, amounts (use ₹), and limits so users can scan quickly.
4. **Leave a blank line**, then add a policy reference on its own line:
   📋 **Policy Reference:** [source] → [category] — "[relevant detail]"

RULES:
- NEVER start with "Yes, I'd be happy to help" or any greeting/filler phrase.
- Use the exact values from the context — do not approximate.
- If something isn't covered, state it plainly, then briefly mention what IS covered as an alternative.
- If the answer isn't in the context, say "This isn't covered in the available policy documents" and suggest contacting your insurance provider.
- Keep the total answer under 5 sentences (excluding the policy reference line).

POLICY CONTEXT:
${ragContext}

USER QUESTION: ${question}`;

      answer = await groqGenerate(prompt, { temperature: 0.4, maxOutputTokens: 800 });
    } else {
      // Fallback when Groq is unavailable — show relevant excerpts without misleading preamble
      const excerpts = results.slice(0, 3).map(r => `• ${r.chunk.text}`).join('\n\n');
      answer = `${excerpts}\n\n(Note: AI summary unavailable — showing relevant policy excerpts. Configure GROQ_API_KEY for natural language answers.)`;
    }

    return Response.json({
      question,
      answer,
      sources: results.map(r => ({
        source: r.chunk.source,
        category: r.chunk.category,
        text: r.chunk.text,
        similarity: r.similarity,
      })),
    });
  } catch (error) {
    console.error('RAG Q&A error:', error);
    return Response.json({ error: 'Failed to answer question' }, { status: 500 });
  }
}
