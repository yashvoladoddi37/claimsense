// POST /api/claims — Submit a new claim
// GET /api/claims — List all claims

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { seedReady } from '@/lib/db/seed';
import { claims, members } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { adjudicate } from '@/lib/engine/pipeline';
import { ClaimInput, Member, AIContext, StepResult } from '@/lib/types';
import { extractFromDocuments, runMedicalReview } from '@/lib/ai/extract';
import { isGroqAvailable, GROQ_MODEL } from '@/lib/ai/groq';
import { generateExplanation } from '@/lib/engine/explainability';
import { agenticAdjudicate } from '@/lib/ai/agent';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

async function generateClaimId(): Promise<string> {
  const allClaims = await db.select().from(claims).all();
  return `CLM_${String(allClaims.length + 1).padStart(5, '0')}`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await seedReady;
        sendUpdate({ type: 'status', message: 'Initializing pipeline...' });

        const contentType = request.headers.get('content-type') || '';
        let claimInput: ClaimInput;
        let documentFiles: { base64: string; mimeType: string }[] = [];
        let aiExtraction = null;

        if (contentType.includes('multipart/form-data')) {
          // File upload path
          const formData = await request.formData();
          const memberId = formData.get('member_id') as string;
          const memberName = formData.get('member_name') as string;
          const treatmentDate = formData.get('treatment_date') as string;
          const claimAmount = parseFloat(formData.get('claim_amount') as string);
          const hospital = formData.get('hospital') as string | null;
          const cashless = formData.get('cashless_request') === 'true';
          const strictMode = formData.get('strict_mode') === 'true';

          // Process uploaded files
          const files = formData.getAll('documents') as File[];
          for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            documentFiles.push({
              base64: buffer.toString('base64'),
              mimeType: file.type,
            });
          }

          // If AI is available and we have files, extract data
          if (isGroqAvailable() && documentFiles.length > 0) {
            sendUpdate({ type: 'status', message: 'Extracting data from documents (OCR + AI)...' });
            aiExtraction = await extractFromDocuments(documentFiles);
            // Build claim input from AI extraction, falling back to form fields
            const ext = aiExtraction.extraction;
            const extractedMemberId = ext.employee_id || ext.member_id;
            
            claimInput = {
              member_id: memberId || extractedMemberId || `WALK_IN_${Date.now()}`,
              member_name: memberName || ext.patient_name || 'Unknown',
              treatment_date: ext.treatment_date || treatmentDate,
              claim_amount: ext.total_amount || claimAmount || 0,
              hospital: hospital || ext.doctor?.clinic_hospital || undefined,
              cashless_request: cashless,
              strict_mode: strictMode,
              documents: {
                prescription: ext.doctor ? {
                  doctor_name: ext.doctor.name || '',
                  doctor_reg: ext.doctor.registration_number || '',
                  diagnosis: ext.diagnosis || '',
                  medicines_prescribed: ext.medicines_prescribed,
                  tests_prescribed: ext.tests_prescribed,
                  qualification: ext.doctor.qualification || undefined,
                  clinic_hospital: ext.doctor.clinic_hospital || undefined,
                } : undefined,
                bill: ext.line_items.length > 0 ? Object.fromEntries(
                  ext.line_items.map(li => [li.description.toLowerCase().replace(/\s+/g, '_'), li.amount])
                ) : undefined,
              },
            };
          } else {
            // No AI — use form data directly
            claimInput = {
              member_id: memberId || `WALK_IN_${Date.now()}`,
              member_name: memberName || 'Unknown',
              treatment_date: treatmentDate,
              claim_amount: claimAmount,
              hospital: hospital || undefined,
              cashless_request: cashless,
              strict_mode: strictMode,
              documents: {},
            };
          }
        } else {
          // JSON path (for test cases / direct API calls)
          claimInput = await request.json();
        }

        sendUpdate({ type: 'status', message: 'Running adjudication agents...' });

        // Look up member
        const member = await db.select().from(members).where(eq(members.id, claimInput.member_id)).get() as Member | undefined;

        // Build AI context — runs medical review + RAG even for JSON-path claims
        let aiContext: AIContext | undefined;
        if (isGroqAvailable() && claimInput.documents?.prescription?.diagnosis) {
          try {
            const prescription = claimInput.documents.prescription;
            const { ragResults, medicalReview } = await runMedicalReview(
              prescription.diagnosis,
              prescription.procedures || [],
              prescription.medicines_prescribed || [],
              prescription.tests_prescribed || [],
            );
            aiContext = {
              medical_necessity_score: medicalReview?.medical_necessity_score as number | undefined,
              medical_necessity_reasoning: medicalReview?.reasoning as string | undefined,
              flags: medicalReview?.flags as string[] | undefined,
              coverage_assessment: medicalReview?.coverage_assessment as string | undefined,
              rag_chunks_used: ragResults.map(r => ({
                source: r.chunk.source,
                category: r.chunk.category,
                text: r.chunk.text,
                similarity: r.similarity,
              })),
            };
          } catch (err) {
            const errMsg = String(err).toLowerCase();
            if (errMsg.includes('rate limit') || errMsg.includes('429')) {
              sendUpdate({ type: 'warning', message: 'AI rate limit during medical review — proceeding with rules only' });
            }
            console.warn('AI medical review failed:', err);
          }
        }

        // Run adjudication — agentic path when AI is available, deterministic fallback otherwise
        const claimId = await generateClaimId();
        let decision;
        let agentReasoning = null;

        const onStep = (step: StepResult) => {
          sendUpdate({ type: 'step', step });
        };
        const onWarning = (message: string) => {
          sendUpdate({ type: 'warning', message });
        };

        if (isGroqAvailable()) {
          // Agentic path: LLM orchestrator decides which tools to call
          try {
            const agentDecision = await agenticAdjudicate(claimInput, member || null, aiContext, claimId, onStep, onWarning);
            decision = agentDecision;
            agentReasoning = agentDecision.agent_reasoning;
          } catch (agentErr) {
            // Fallback to deterministic pipeline if agent fails
            const errMsg = String(agentErr);
            const errMsgLower = errMsg.toLowerCase();
            const isRateLimit = errMsgLower.includes('rate limit') || errMsgLower.includes('429') || errMsgLower.includes('rate_limit');
            const isModelError = errMsgLower.includes('does not exist') || errMsgLower.includes('not supported') || errMsgLower.includes('model_not_found');
            const isToolError = errMsgLower.includes('tool call') || errMsgLower.includes('tool_use');

            // Extract a concise error reason for the UI
            let errorReason: string;
            if (isRateLimit) {
              errorReason = 'AI API rate limit exhausted';
            } else if (isModelError) {
              errorReason = `AI model error: ${GROQ_MODEL} is unavailable or unsupported`;
            } else if (isToolError) {
              errorReason = 'AI model returned malformed tool call — retrying with rule engine';
            } else {
              errorReason = `AI agent error: ${errMsg.slice(0, 150)}`;
            }

            sendUpdate({
              type: 'warning',
              message: `${errorReason} — falling back to rule-based adjudication`,
            });
            console.warn('⚠️ Agent failed, falling back to deterministic pipeline:', agentErr);
            decision = adjudicate(claimInput, { member: member || null, aiContext }, claimId);
            // Prepend the actual error to decision notes so the UI shows the real cause
            decision.notes = `[Agent fallback: ${errorReason}] ${decision.notes}`;
            for (const step of decision.steps) {
              sendUpdate({ type: 'step', step });
            }
          }
        } else {
          // Deterministic path: hardcoded sequential pipeline
          decision = adjudicate(claimInput, { member: member || null, aiContext }, claimId);
          // Emit step results for frontend progress
          for (const step of decision.steps) {
            sendUpdate({ type: 'step', step });
          }
        }

        // Generate explainability data
        const explanation = generateExplanation(decision, claimInput, aiContext);

        // Ensure member_id is never null for DB constraint
        if (!claimInput.member_id) claimInput.member_id = `WALK_IN_${Date.now()}`;
        if (!claimInput.member_name) claimInput.member_name = 'Unknown';

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
          documents_json: documentFiles.length > 0 ? JSON.stringify(documentFiles.map(f => ({ mimeType: f.mimeType, size: f.base64.length }))) : null,
          extraction_json: JSON.stringify({
            ...(aiExtraction || {}),
            ...(aiContext ? { aiContext } : {}),
            ...(agentReasoning ? { agentReasoning } : {}),
            explanation,
          }),
          decision: decision.decision,
          decision_reasons_json: JSON.stringify(decision.rejection_reasons),
          decision_notes: decision.notes,
          confidence_score: decision.confidence_score,
          processing_time_ms: decision.processing_time_ms,
          pipeline_result_json: JSON.stringify(decision.steps),
          created_at: now,
          updated_at: now,
        }).run();

        sendUpdate({
          type: 'final',
          claim_id: claimId,
          status: decision.decision,
          claim_amount: claimInput.claim_amount,
          decision,
          explanation,
          processing_time_ms: decision.processing_time_ms,
        });

        controller.close();
      } catch (error) {
        console.error('Claim submission error:', error);
        sendUpdate({ type: 'error', message: String(error) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await seedReady;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const memberId = url.searchParams.get('member_id');

    const allClaims = (await db.select().from(claims).orderBy(desc(claims.created_at)).all()).filter((c: { status: string; member_id: string }) => {
      if (status && c.status !== status) return false;
      if (memberId && c.member_id !== memberId) return false;
      return true;
    });

    return Response.json({ claims: allClaims, total: allClaims.length });
  } catch (error) {
    console.error('Claims list error:', error);
    return Response.json({ error: 'Failed to fetch claims' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await seedReady;
    await db.run(sql`DELETE FROM ${claims}`);
    return Response.json({ success: true, message: 'All claims deleted' });
  } catch (error) {
    console.error('Claims reset error:', error);
    return Response.json({ error: 'Failed to reset claims' }, { status: 500 });
  }
}
