// POST /api/vapi/webhook — Handles tool calls from Vapi voice agent
// Vapi sends tool-call requests here; we execute and return results as strings.
// Must always return HTTP 200.

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { seedReady } from '@/lib/db/seed';
import { claims, members } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { adjudicate } from '@/lib/engine/pipeline';
import { agenticAdjudicate } from '@/lib/ai/agent';
import { ClaimInput, Member, AIContext } from '@/lib/types';
import { isGroqAvailable } from '@/lib/ai/groq';
import { runMedicalReview } from '@/lib/ai/extract';
import { retrieveContext, formatRetrievedContext, initializeKnowledgeBase } from '@/lib/ai/rag';
import { groqGenerate } from '@/lib/ai/groq';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function generateClaimId(): Promise<string> {
  const allClaims = await db.select().from(claims).all();
  return `CLM_${String(allClaims.length + 1).padStart(5, '0')}`;
}

// ---- Tool Handlers ----

async function handleFileClaim(args: {
  patient_name: string;
  employee_id: string;
  diagnosis: string;
  treatment_type: string;
  hospital_name?: string;
  bill_amount: number;
  treatment_date?: string;
  doctor_name?: string;
  doctor_registration?: string;
  cashless?: boolean;
}): Promise<string> {
  await seedReady;

  const claimInput: ClaimInput = {
    member_id: args.employee_id || `VOICE_${Date.now()}`,
    member_name: args.patient_name,
    treatment_date: args.treatment_date || new Date().toISOString().split('T')[0],
    claim_amount: args.bill_amount,
    hospital: args.hospital_name || undefined,
    cashless_request: args.cashless || false,
    documents: {
      prescription: {
        doctor_name: args.doctor_name || 'Dr. Unknown',
        doctor_reg: args.doctor_registration || '',
        diagnosis: args.diagnosis,
        medicines_prescribed: [],
        tests_prescribed: [],
      },
      bill: {
        [args.treatment_type || 'consultation']: args.bill_amount,
      },
    },
  };

  const member = await db.select().from(members)
    .where(eq(members.id, claimInput.member_id)).get() as Member | undefined;

  // Build AI context if available
  let aiContext: AIContext | undefined;
  if (isGroqAvailable() && args.diagnosis) {
    try {
      const { ragResults, medicalReview } = await runMedicalReview(
        args.diagnosis, [], [], [],
      );
      aiContext = {
        medical_necessity_score: medicalReview?.medical_necessity_score as number | undefined,
        medical_necessity_reasoning: medicalReview?.reasoning as string | undefined,
        flags: medicalReview?.flags as string[] | undefined,
        rag_chunks_used: ragResults.map(r => ({
          source: r.chunk.source, category: r.chunk.category,
          text: r.chunk.text, similarity: r.similarity,
        })),
      };
    } catch {
      // Continue without AI context
    }
  }

  const claimId = await generateClaimId();
  let decision;

  if (isGroqAvailable()) {
    try {
      decision = await agenticAdjudicate(claimInput, member || null, aiContext, claimId);
    } catch {
      decision = adjudicate(claimInput, { member: member || null, aiContext }, claimId);
    }
  } else {
    decision = adjudicate(claimInput, { member: member || null, aiContext }, claimId);
  }

  // Store claim
  const now = new Date().toISOString();
  await db.insert(claims).values({
    id: claimId,
    member_id: claimInput.member_id,
    member_name: claimInput.member_name,
    status: decision.decision,
    claim_amount: claimInput.claim_amount,
    approved_amount: decision.approved_amount,
    treatment_date: claimInput.treatment_date,
    submission_date: now.split('T')[0],
    hospital: claimInput.hospital || null,
    cashless_request: claimInput.cashless_request || false,
    input_data_json: JSON.stringify(claimInput),
    extraction_json: JSON.stringify({ aiContext, source: 'voice' }),
    decision: decision.decision,
    decision_reasons_json: JSON.stringify(decision.rejection_reasons),
    decision_notes: decision.notes,
    confidence_score: decision.confidence_score,
    processing_time_ms: decision.processing_time_ms,
    pipeline_result_json: JSON.stringify(decision.steps),
    created_at: now,
    updated_at: now,
  }).run();

  const amt = decision.approved_amount;
  if (decision.decision === 'APPROVED') {
    return `Claim ${claimId} has been approved. Approved amount is Rs ${amt}. ${decision.notes}`;
  } else if (decision.decision === 'PARTIAL') {
    return `Claim ${claimId} is partially approved. Approved amount is Rs ${amt} out of Rs ${claimInput.claim_amount}. ${decision.notes}`;
  } else if (decision.decision === 'REJECTED') {
    const reasons = decision.rejection_reasons?.join(', ') || 'Policy rules';
    return `Claim ${claimId} has been rejected. Reason: ${reasons}. ${decision.notes}`;
  } else {
    return `Claim ${claimId} has been flagged for manual review. ${decision.notes}`;
  }
}

async function handleCheckStatus(args: { claim_id: string }): Promise<string> {
  await seedReady;
  const claim = await db.select().from(claims)
    .where(eq(claims.id, args.claim_id)).get();

  if (!claim) {
    return `No claim found with ID ${args.claim_id}. Please check the claim ID and try again.`;
  }

  return `Claim ${claim.id}: Status is ${claim.status}. ` +
    `Claim amount: Rs ${claim.claim_amount}. ` +
    `Approved amount: Rs ${claim.approved_amount || 0}. ` +
    `Filed on: ${claim.submission_date}. ` +
    (claim.decision_notes ? `Notes: ${claim.decision_notes}` : '');
}

async function handlePolicyQuestion(args: { question: string }): Promise<string> {
  await initializeKnowledgeBase();
  const results = await retrieveContext(args.question, 5);
  const ragContext = formatRetrievedContext(results);

  if (isGroqAvailable()) {
    const prompt = `You are a concise insurance policy assistant. Answer based ONLY on the policy context below. Keep answer under 3 sentences. Use simple language suitable for a phone conversation.

POLICY CONTEXT:
${ragContext}

QUESTION: ${args.question}`;

    return await groqGenerate(prompt, { temperature: 0.3, maxOutputTokens: 300 });
  }

  // Fallback: return top excerpt
  if (results.length > 0) {
    return results[0].chunk.text;
  }
  return 'I could not find information about that in the policy. Please ask a different question.';
}

async function handleListClaims(args: { employee_id: string }): Promise<string> {
  await seedReady;
  const memberClaims = await db.select().from(claims)
    .where(eq(claims.member_id, args.employee_id))
    .orderBy(desc(claims.created_at)).all();

  if (memberClaims.length === 0) {
    return `No claims found for member ${args.employee_id}.`;
  }

  const summary = memberClaims.slice(0, 5).map(c =>
    `${c.id}: ${c.status}, Rs ${c.claim_amount}, filed ${c.submission_date}`
  ).join('. ');

  return `Found ${memberClaims.length} claims for ${args.employee_id}. Most recent: ${summary}`;
}

// ---- Main Webhook Handler ----

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    // Only handle tool-calls
    if (message?.type !== 'tool-calls') {
      return Response.json({});
    }

    const results = await Promise.all(
      message.toolCallList.map(async (toolCall: { id: string; function: { name: string; arguments: string } }) => {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let result: string;

        try {
          switch (fnName) {
            case 'file_claim':
              result = await handleFileClaim(args);
              break;
            case 'check_claim_status':
              result = await handleCheckStatus(args);
              break;
            case 'ask_policy_question':
              result = await handlePolicyQuestion(args);
              break;
            case 'list_my_claims':
              result = await handleListClaims(args);
              break;
            default:
              result = `Unknown function: ${fnName}`;
          }
        } catch (err) {
          result = `Error processing ${fnName}: ${String(err).slice(0, 200)}`;
        }

        return { toolCallId: toolCall.id, result };
      })
    );

    return Response.json({ results });
  } catch (error) {
    console.error('Vapi webhook error:', error);
    return Response.json({ results: [{ toolCallId: 'error', result: 'Internal server error' }] });
  }
}
