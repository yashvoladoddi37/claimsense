// ============================================================
// Agentic Adjudication Engine
// Uses Vercel AI SDK with Gemini to orchestrate claim processing.
// The LLM autonomously decides which tools to call, reasons about
// results, and synthesizes a final decision.
// ============================================================

import { generateText, tool, stepCountIs, zodSchema } from 'ai';
import { GROQ_MODEL, withGroqRotation } from './groq';
import { z } from 'zod';

import { checkEligibility } from '../engine/eligibility';
import { validateDocuments } from '../engine/documents';
import { checkCoverage } from '../engine/coverage';
import { calculateLimits } from '../engine/limits';
import { detectFraud } from '../engine/fraud';
import { reviewMedicalNecessity } from '../engine/medical-review';
import { retrieveContext, initializeKnowledgeBase } from './rag';
import { ClaimInput, Member, AIContext, Decision, StepResult, ClaimDecision, RejectionReason } from '../types';
import { db } from '../db';
import { members } from '../db/schema';
import { eq } from 'drizzle-orm';


// ---- Tool Definitions ----
// Each tool wraps an existing rule function, giving the LLM agent
// the ability to invoke them autonomously.

function buildTools(claim: ClaimInput, memberRecord: Member | null, aiContext?: AIContext) {
  // Shared state: coverage step can store its approved amount so limits step
  // automatically picks it up — avoids relying on LLM to pass it correctly.
  const sharedState = { coverageApprovedAmount: undefined as number | undefined };

  return {
    check_eligibility: tool({
      description:
        'Check if the member is eligible for this claim. Validates policy status, ' +
        'waiting periods (initial 30-day, specific ailments like diabetes 90 days, hypertension 90 days), ' +
        'and member coverage. Call this FIRST for any claim.',
      inputSchema: zodSchema(z.object({
        reason: z.string().describe('Why you are checking eligibility'),
      })),
      execute: async (): Promise<Record<string, unknown>> => {
        const result = checkEligibility(claim, memberRecord);
        return {
          step: result.step,
          passed: result.passed,
          impact: result.decision_impact,
          reasons: result.reasons,
          details: result.details,
        };
      },
    }),

    validate_documents: tool({
      description:
        'Validate that all required documents are present and valid. Checks for: ' +
        'prescription from registered doctor, valid doctor registration number (format: StateCode/Number/Year), ' +
        'bill/invoice presence, and diagnosis. Call this after eligibility check.',
      inputSchema: zodSchema(z.object({
        reason: z.string().describe('Why you are validating documents'),
      })),
      execute: async (): Promise<Record<string, unknown>> => {
        const result = validateDocuments(claim);
        return {
          step: result.step,
          passed: result.passed,
          impact: result.decision_impact,
          reasons: result.reasons,
          details: result.details,
        };
      },
    }),

    check_coverage: tool({
      description:
        'Verify if the treatment/service is covered under the policy. Checks against ' +
        'exclusions list (cosmetic procedures, weight loss, infertility, experimental treatments, etc.), ' +
        'pre-authorization requirements (MRI, CT scan need pre-auth), and identifies partially covered items. ' +
        'Call this after document validation passes.',
      inputSchema: zodSchema(z.object({
        reason: z.string().describe('Why you are checking coverage'),
      })),
      execute: async (): Promise<Record<string, unknown>> => {
        const result = checkCoverage(claim);
        // Store approved amount so limits step can use it automatically
        if (result.adjustments?.approved_amount !== undefined) {
          sharedState.coverageApprovedAmount = result.adjustments.approved_amount;
        }
        return {
          step: result.step,
          passed: result.passed,
          impact: result.decision_impact,
          reasons: result.reasons,
          details: result.details,
          adjustments: result.adjustments || null,
        };
      },
    }),

    calculate_limits: tool({
      description:
        'Calculate financial limits and deductions. Checks per-claim limit (₹5,000 general, category-specific ' +
        'sub-limits for dental ₹10K, diagnostic ₹10K, alt medicine ₹8K), annual limit (₹50,000), ' +
        'network hospital discount (20%), and co-pay (10% for general claims). ' +
        'Call this after coverage check. If coverage returned a partial amount, pass it as adjusted_amount.',
      inputSchema: zodSchema(z.object({
        reason: z.string().describe('Why you are calculating limits'),
        adjusted_amount: z.number().optional().describe('Amount adjusted by coverage step (for partial approvals)'),
      })),
      execute: async ({ adjusted_amount }: { adjusted_amount?: number }): Promise<Record<string, unknown>> => {
        // Use shared state from coverage step if LLM didn't pass the adjusted amount.
        // Treat 0 as "no adjustment" — a 0 adjusted_amount is nonsensical and likely
        // the LLM misinterpreting "no partial reduction" as 0.
        const effectiveAmount = (adjusted_amount || undefined) ?? sharedState.coverageApprovedAmount;
        const result = calculateLimits(claim, { ytdApprovedAmount: 0 }, effectiveAmount);
        return {
          step: result.step,
          passed: result.passed,
          impact: result.decision_impact,
          reasons: result.reasons,
          details: result.details,
          adjustments: result.adjustments || null,
        };
      },
    }),

    detect_fraud: tool({
      description:
        'Screen the claim for fraud indicators. Checks: multiple claims on the same day (>=2 previous), ' +
        'high-value claims (>₹25,000), and suspicious patterns like amounts at exact limit boundaries. ' +
        'Fraud triggers MANUAL_REVIEW, not outright rejection.',
      inputSchema: zodSchema(z.object({
        reason: z.string().describe('Why you are running fraud detection'),
      })),
      execute: async (): Promise<Record<string, unknown>> => {
        const result = detectFraud(claim);
        return {
          step: result.step,
          passed: result.passed,
          impact: result.decision_impact,
          reasons: result.reasons,
          details: result.details,
        };
      },
    }),

    assess_medical_necessity: tool({
      description:
        'Assess whether the treatment is medically necessary for the diagnosis using AI analysis. ' +
        'Uses medical necessity score from AI context. Score <0.4 = not necessary (MANUAL_REVIEW), ' +
        '0.4-0.7 = moderate (MANUAL_REVIEW), >0.7 = medically justified. ' +
        'Call this as the final check after all other validations pass.',
      inputSchema: zodSchema(z.object({
        reason: z.string().describe('Why you are assessing medical necessity'),
      })),
      execute: async (): Promise<Record<string, unknown>> => {
        const result = reviewMedicalNecessity(claim, aiContext);
        return {
          step: result.step,
          passed: result.passed,
          impact: result.decision_impact,
          reasons: result.reasons,
          details: result.details,
        };
      },
    }),

    search_policy: tool({
      description:
        'Search the insurance policy knowledge base using semantic search. Use this to look up ' +
        'specific policy terms, coverage details, exclusions, waiting periods, or any policy-related question. ' +
        'Returns the most relevant policy sections ranked by relevance.',
      inputSchema: zodSchema(z.object({
        query: z.string().describe('Natural language query about the policy'),
      })),
      execute: async ({ query }: { query: string }) => {
        await initializeKnowledgeBase();
        const results = await retrieveContext(query, 3);
        return results.map(r => ({
          source: r.chunk.source,
          category: r.chunk.category,
          text: r.chunk.text,
          relevance: `${(r.similarity * 100).toFixed(0)}%`,
        }));
      },
    }),

    lookup_member: tool({
      description:
        'Look up a member in the policy database by their member ID. Returns member details ' +
        'including join date, policy start date, and name. Use this to verify member information.',
      inputSchema: zodSchema(z.object({
        member_id: z.string().describe('The member ID to look up (e.g., EMP001)'),
      })),
      execute: async ({ member_id }: { member_id: string }) => {
        const member = await db.select().from(members).where(eq(members.id, member_id)).get();
        if (!member) return { found: false, message: `Member ${member_id} not found in records` };
        return {
          found: true,
          id: member.id,
          name: member.name,
          join_date: member.join_date,
          policy_start_date: member.policy_start_date,
          policy_id: member.policy_id,
        };
      },
    }),

    make_decision: tool({
      description:
        'Submit your final adjudication decision after running all necessary checks. ' +
        'You MUST call this tool exactly once as your final action to record the decision.',
      inputSchema: zodSchema(z.object({
        decision: z.enum(['APPROVED', 'REJECTED', 'PARTIAL', 'MANUAL_REVIEW']).describe('The adjudication decision'),
        approved_amount: z.union([z.number(), z.string()]).describe('The approved reimbursement amount (0 if rejected)'),
        rejection_reasons: z.array(z.string()).describe('List of rejection reason codes if rejected/partial'),
        confidence_score: z.union([z.number(), z.string()]).describe('Your confidence in this decision (0.0 to 1.0)'),
        reasoning: z.string().describe('Detailed explanation of why you made this decision'),
        next_steps: z.string().describe('What the claimant should do next'),
      })),
      execute: async (params: {
        decision: string;
        approved_amount: number | string;
        rejection_reasons: string[];
        confidence_score: number | string;
        reasoning: string;
        next_steps: string;
      }) => {
        return {
          recorded: true,
          ...params,
          approved_amount: Number(params.approved_amount),
          confidence_score: Number(params.confidence_score),
        };
      },
    }),
  };
}

// ---- System Prompt ----

const SYSTEM_PROMPT = `You are an expert insurance claims adjudicator for an Indian health insurance company.
Your job is to process OPD (Outpatient Department) insurance claims by analyzing documents and applying policy rules.

## Your Process
You have access to tools that check different aspects of a claim. You should:

1. First, look up the member to verify their identity and policy details.
2. Check eligibility — verify the policy is active and waiting periods are satisfied.
3. Validate documents — ensure prescription, bills, and doctor registration are valid.
4. Check coverage — verify the treatment is covered and not excluded.
5. Calculate limits — apply per-claim limits, co-pay, network discounts.
6. Detect fraud — screen for suspicious patterns.
7. If all checks pass, assess medical necessity using AI analysis.

## Decision Rules
- If ANY check returns a REJECT impact, the claim is REJECTED. Stop checking further and call make_decision immediately.
- If a check returns PARTIAL, continue but note the adjusted amount and pass it to calculate_limits.
- If fraud detection flags issues, decision is MANUAL_REVIEW.
- If medical necessity score is low, decision is MANUAL_REVIEW.
- If ALL checks pass, the claim is APPROVED with the amount from calculate_limits.

## Important
- You can search the policy knowledge base at any time for clarification.
- After all checks, you MUST call the make_decision tool with your final decision.
- Be thorough but efficient — don't repeat checks unnecessarily.
- Base your confidence score on how clear-cut the decision is.
- Always explain your reasoning clearly.`;

// ---- Agent Execution ----

export interface AgentDecision extends Decision {
  agent_reasoning: AgentStep[];
}

export interface AgentStep {
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_result: unknown;
  reasoning?: string;
}

export async function agenticAdjudicate(
  claim: ClaimInput,
  memberRecord: Member | null,
  aiContext?: AIContext,
  claimId: string = 'CLM_00000',
  onStep?: (step: StepResult) => void,
  onWarning?: (message: string) => void
): Promise<AgentDecision> {
  const startTime = Date.now();
  const tools = buildTools(claim, memberRecord, aiContext);
  const claimSummary = buildClaimSummary(claim);

  const result = await withGroqRotation(async (groq) => {
    return await generateText({
      model: groq(GROQ_MODEL),
      system: SYSTEM_PROMPT,
      prompt: `Process the following OPD insurance claim and make an adjudication decision:\n\n${claimSummary}`,
      tools,
      maxRetries: 0, // Disable SDK retry — our rotation handles retries across keys
      stopWhen: stepCountIs(15),
      onStepFinish(event) {
        // Log each step for observability
        if (event.toolCalls && event.toolCalls.length > 0) {
          for (const tc of event.toolCalls) {
            console.log(`  🔧 Agent called: ${tc.toolName}(${JSON.stringify(tc.input).slice(0, 100)})`);
          }
        }
        if (event.text) {
          console.log(`  💭 Agent reasoning: ${event.text.slice(0, 150)}...`);
        }

        // Emit step update if callback provided
        if (onStep && event.toolResults && event.toolResults.length > 0) {
          for (const tr of event.toolResults) {
            const toolOutput = tr.output as Record<string, unknown>;
            if (toolOutput && typeof toolOutput === 'object' && 'step' in toolOutput) {
              onStep({
                step: toolOutput.step as string,
                passed: toolOutput.passed as boolean,
                decision_impact: (toolOutput.impact as StepResult['decision_impact']) || 'NONE',
                reasons: (toolOutput.reasons as RejectionReason[]) || [],
                details: (toolOutput.details as string) || '',
                adjustments: (toolOutput.adjustments as StepResult['adjustments']) || undefined,
              });
            }
          }
        }
      },
    });
  }, onWarning);

  // Extract the agent's reasoning chain from result.steps
  const agentSteps: AgentStep[] = [];
  const pipelineSteps: StepResult[] = [];

  for (const step of result.steps) {
    // Capture reasoning text
    const reasoning = step.text || undefined;

    if (step.toolCalls && step.toolCalls.length > 0) {
      for (let i = 0; i < step.toolCalls.length; i++) {
        const tc = step.toolCalls[i];
        const tr = step.toolResults?.[i];

        agentSteps.push({
          tool_name: tc.toolName,
          tool_args: tc.input as Record<string, unknown>,
          tool_result: tr?.output,
          reasoning,
        });

        // Convert rule-engine tool results to StepResult for UI compatibility
        const toolOutput = tr?.output;
        if (toolOutput && typeof toolOutput === 'object' && 'step' in (toolOutput as object)) {
          const toolResult = toolOutput as Record<string, unknown>;
          pipelineSteps.push({
            step: toolResult.step as string,
            passed: toolResult.passed as boolean,
            decision_impact: (toolResult.impact as StepResult['decision_impact']) || 'NONE',
            reasons: (toolResult.reasons as RejectionReason[]) || [],
            details: (toolResult.details as string) || '',
            adjustments: (toolResult.adjustments as StepResult['adjustments']) || undefined,
          });
        }
      }
    }
  }

  // Extract the final decision from make_decision tool call
  const decisionStep = agentSteps.find(s => s.tool_name === 'make_decision');
  const finalText = result.text;

  let decision: ClaimDecision = 'MANUAL_REVIEW';
  let approvedAmount = 0;
  let rejectionReasons: RejectionReason[] = [];
  let confidenceScore = 0.7;
  let notes = '';
  let nextSteps = '';

  if (decisionStep) {
    const args = decisionStep.tool_args;
    decision = args.decision as ClaimDecision;
    approvedAmount = Number(args.approved_amount) || 0;
    rejectionReasons = (args.rejection_reasons as string[]).filter(
      (r: string) => r && r.length > 0
    ) as RejectionReason[];
    confidenceScore = Number(args.confidence_score) || 0.7;
    notes = args.reasoning as string;
    nextSteps = args.next_steps as string;
  } else {
    notes = finalText || 'Agent did not produce a structured decision. Flagged for manual review.';
    nextSteps = 'Claim will be reviewed by a human adjudicator.';
  }

  // ---- Post-processing: reconcile agent decision with tool results ----
  // The LLM sometimes gets the decision/amount wrong. Use the deterministic
  // pipeline steps as ground truth to correct inconsistencies.

  const eligStep = pipelineSteps.find(s => s.step === 'Eligibility Check');
  const coverageStep = pipelineSteps.find(s => s.step === 'Coverage Check');
  const fraudStep = pipelineSteps.find(s => s.step === 'Fraud Detection');
  const medicalStep = pipelineSteps.find(s => s.step === 'AI Medical Review');

  // Derive the correct decision from pipeline steps using priority rules
  const hasReject = pipelineSteps.some(s => s.decision_impact === 'REJECT');
  const hasPartial = pipelineSteps.some(s => s.decision_impact === 'PARTIAL');
  const hasFraudReview = fraudStep && !fraudStep.passed;
  const hasMedicalReview = medicalStep && !medicalStep.passed;

  // Compute correct approved amount from coverage step
  const coverageApproved = coverageStep?.adjustments?.approved_amount as number | undefined;

  if (hasReject) {
    // Hard reject takes precedence over everything — 
    // eligibility failed, service not covered, or below minimum amount.
    decision = 'REJECTED';
    approvedAmount = 0;
  } else if (hasPartial) {
    // Partial — some items excluded or limits exceeded, but otherwise valid
    decision = 'PARTIAL';
    if (coverageApproved !== undefined && coverageApproved > 0) {
      approvedAmount = coverageApproved;
    }
  } else if (hasFraudReview || hasMedicalReview) {
    decision = 'MANUAL_REVIEW';
  } else if (!hasReject) {
    // All passed
    decision = 'APPROVED';
    if (approvedAmount === 0) {
      approvedAmount = coverageApproved ?? claim.claim_amount;
    }
  }

  // Ensure approved amount is never negative
  if (approvedAmount < 0) approvedAmount = 0;

  const processingTime = Date.now() - startTime;

  return {
    claim_id: claimId,
    decision,
    approved_amount: approvedAmount,
    rejection_reasons: rejectionReasons,
    confidence_score: confidenceScore,
    notes,
    next_steps: nextSteps,
    steps: pipelineSteps,
    ai_context: aiContext,
    processing_time_ms: processingTime,
    agent_reasoning: agentSteps,
  };
}

// ---- Helpers ----

function buildClaimSummary(claim: ClaimInput): string {
  const lines: string[] = [];
  lines.push(`**Claim Details:**`);
  lines.push(`- Member ID: ${claim.member_id}`);
  lines.push(`- Member Name: ${claim.member_name}`);
  lines.push(`- Treatment Date: ${claim.treatment_date}`);
  lines.push(`- Claim Amount: ₹${claim.claim_amount.toLocaleString()}`);
  if (claim.hospital) lines.push(`- Hospital: ${claim.hospital}`);
  if (claim.cashless_request) lines.push(`- Cashless Request: Yes`);
  if (claim.member_join_date) lines.push(`- Member Join Date: ${claim.member_join_date}`);
  if (claim.previous_claims_same_day) {
    lines.push(`- Previous Claims Same Day: ${claim.previous_claims_same_day}`);
  }

  if (claim.documents.prescription) {
    const p = claim.documents.prescription;
    lines.push(`\n**Prescription:**`);
    lines.push(`- Doctor: ${p.doctor_name} (Reg: ${p.doctor_reg})`);
    lines.push(`- Diagnosis: ${p.diagnosis}`);
    if (p.medicines_prescribed?.length) lines.push(`- Medicines: ${p.medicines_prescribed.join(', ')}`);
    if (p.tests_prescribed?.length) lines.push(`- Tests: ${p.tests_prescribed.join(', ')}`);
    if (p.procedures?.length) lines.push(`- Procedures: ${p.procedures.join(', ')}`);
    if (p.treatment) lines.push(`- Treatment: ${p.treatment}`);
  } else {
    lines.push(`\n**Prescription:** Not provided`);
  }

  if (claim.documents.bill) {
    const b = claim.documents.bill;
    lines.push(`\n**Bill:**`);
    for (const [key, value] of Object.entries(b)) {
      if (typeof value === 'number' && value > 0) {
        lines.push(`- ${key.replace(/_/g, ' ')}: ₹${value.toLocaleString()}`);
      }
    }
  } else {
    lines.push(`\n**Bill:** Not provided`);
  }

  return lines.join('\n');
}
