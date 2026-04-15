// ============================================================
// Adjudication Pipeline Orchestrator
// Runs all steps in order, synthesizes final decision
// ============================================================

import { ClaimInput, Decision, StepResult, Member, ClaimDecision, RejectionReason, AIContext } from '../types';
import { checkEligibility } from './eligibility';
import { validateDocuments } from './documents';
import { checkCoverage } from './coverage';
import { calculateLimits } from './limits';
import { detectFraud } from './fraud';
import { reviewMedicalNecessity } from './medical-review';

interface PipelineContext {
  member: Member | null;
  ytdApprovedAmount?: number;
  /** AI context from Gemini medical review + RAG (when available) */
  aiContext?: AIContext;
}

export function adjudicate(
  claim: ClaimInput,
  context: PipelineContext,
  claimId: string = 'CLM_00000'
): Decision {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  // Step 1: Eligibility
  const eligibility = checkEligibility(claim, context.member);
  steps.push(eligibility);
  if (eligibility.decision_impact === 'REJECT') {
    return synthesize(claimId, claim, steps, startTime, context.aiContext);
  }

  // Step 2: Document Validation
  const documents = validateDocuments(claim);
  steps.push(documents);
  if (documents.decision_impact === 'REJECT') {
    return synthesize(claimId, claim, steps, startTime, context.aiContext);
  }

  // Step 3: Coverage
  const coverage = checkCoverage(claim);
  steps.push(coverage);
  if (coverage.decision_impact === 'REJECT') {
    return synthesize(claimId, claim, steps, startTime, context.aiContext);
  }

  // Step 4: Limits (pass adjusted amount from coverage if partial)
  const adjustedAmount = coverage.adjustments?.approved_amount;
  const limits = calculateLimits(
    claim,
    { ytdApprovedAmount: context.ytdApprovedAmount || 0 },
    adjustedAmount
  );
  steps.push(limits);
  if (limits.decision_impact === 'REJECT') {
    return synthesize(claimId, claim, steps, startTime, context.aiContext);
  }

  // Step 5: Fraud Detection
  const fraud = detectFraud(claim);
  steps.push(fraud);
  if (fraud.decision_impact === 'MANUAL_REVIEW') {
    return synthesize(claimId, claim, steps, startTime, context.aiContext);
  }

  // Step 6: AI Medical Necessity Review
  // This is where AI ACTUALLY influences the decision.
  // Low medical necessity score → MANUAL_REVIEW.
  const medicalReview = reviewMedicalNecessity(claim, context.aiContext);
  steps.push(medicalReview);

  return synthesize(claimId, claim, steps, startTime, context.aiContext);
}

function synthesize(
  claimId: string,
  claim: ClaimInput,
  steps: StepResult[],
  startTime: number,
  aiContext?: AIContext
): Decision {
  const processingTime = Date.now() - startTime;

  // Collect all rejection reasons
  const allReasons: RejectionReason[] = [];
  for (const step of steps) {
    allReasons.push(...step.reasons);
  }

  // Determine decision based on priority rules
  let decision: ClaimDecision = 'APPROVED';
  let approvedAmount = claim.claim_amount;
  let cashlessApproved: boolean | undefined;
  let networkDiscount: number | undefined;
  const notes: string[] = [];
  const nextSteps: string[] = [];

  // Check for MANUAL_REVIEW first (fraud)
  if (steps.some(s => s.decision_impact === 'MANUAL_REVIEW')) {
    decision = 'MANUAL_REVIEW';
    approvedAmount = 0;
    notes.push('Claim flagged for manual review due to fraud indicators.');
    nextSteps.push('Claim will be reviewed by a human adjudicator within 48 hours.');
  }
  // Check for hard REJECT
  else if (steps.some(s => s.decision_impact === 'REJECT')) {
    decision = 'REJECTED';
    approvedAmount = 0;
    const rejectStep = steps.find(s => s.decision_impact === 'REJECT');
    notes.push(rejectStep?.details || 'Claim rejected.');
    nextSteps.push('Please review the rejection reasons and submit a new claim if applicable.');
  }
  // Check for PARTIAL
  else if (steps.some(s => s.decision_impact === 'PARTIAL')) {
    decision = 'PARTIAL';
    // Use the coverage-adjusted amount, then apply limits adjustments
    const coverageStep = steps.find(s => s.step === 'Coverage Check');
    const limitsStep = steps.find(s => s.step === 'Limits Check');
    approvedAmount = limitsStep?.adjustments?.approved_amount
      ?? coverageStep?.adjustments?.approved_amount
      ?? claim.claim_amount;
    const rejectedItems = coverageStep?.adjustments?.rejected_items || [];
    const noteParts: string[] = ['Partial approval.'];
    if (rejectedItems.length > 0) {
      noteParts.push(`Rejected items: ${rejectedItems.join(', ')}.`);
    }
    if (limitsStep?.decision_impact === 'PARTIAL') {
      noteParts.push(limitsStep.details);
    }
    notes.push(noteParts.join(' '));
    nextSteps.push('The approved portion will be reimbursed. Excluded items cannot be claimed.');
  }
  // APPROVED
  else {
    const limitsStep = steps.find(s => s.step === 'Limits Check');
    approvedAmount = limitsStep?.adjustments?.approved_amount ?? claim.claim_amount;
    networkDiscount = limitsStep?.adjustments?.network_discount;
    if (networkDiscount && networkDiscount > 0) {
      notes.push(`Network discount applied: ₹${networkDiscount}.`);
    }
    const copay = limitsStep?.adjustments?.copay_deduction;
    if (copay && copay > 0) {
      notes.push(`Co-pay deducted: ₹${copay}.`);
    }
    if (claim.cashless_request && claim.hospital) {
      cashlessApproved = true;
      notes.push('Cashless claim approved at network hospital.');
    }
    nextSteps.push('Approved amount will be processed for reimbursement within 5-7 business days.');
  }

  // Confidence score calculation — blends rule engine clarity with AI assessment
  const confidence = calculateConfidence(steps, decision, aiContext);

  // Force MANUAL_REVIEW if confidence < 0.70
  if (confidence < 0.70 && decision !== 'REJECTED' && decision !== 'MANUAL_REVIEW') {
    decision = 'MANUAL_REVIEW';
    notes.push(`Low confidence (${(confidence * 100).toFixed(0)}%) — flagged for manual review.`);
  }

  return {
    claim_id: claimId,
    decision,
    approved_amount: approvedAmount,
    rejection_reasons: allReasons,
    confidence_score: confidence,
    notes: notes.join(' '),
    next_steps: nextSteps.join(' '),
    steps,
    cashless_approved: cashlessApproved,
    network_discount: networkDiscount,
    ai_context: aiContext,
    processing_time_ms: processingTime,
  };
}

function calculateConfidence(
  steps: StepResult[],
  decision: ClaimDecision,
  aiContext?: AIContext
): number {
  // Base confidence from deterministic rule engine (60% weight)
  let ruleConfidence = 0.95;

  if (decision === 'MANUAL_REVIEW') {
    ruleConfidence = 0.65;
  } else if (decision === 'REJECTED') {
    ruleConfidence = 0.97;
    const reasons = steps.flatMap(s => s.reasons);
    if (reasons.includes('WAITING_PERIOD')) ruleConfidence = 0.96;
    if (reasons.includes('PER_CLAIM_EXCEEDED')) ruleConfidence = 0.98;
    if (reasons.includes('MISSING_DOCUMENTS')) ruleConfidence = 1.0;
  } else if (decision === 'PARTIAL') {
    ruleConfidence = 0.92;
  }

  // If no AI context, return rule confidence only
  if (!aiContext || aiContext.medical_necessity_score === undefined) {
    return ruleConfidence;
  }

  // Blend: 60% rule engine + 40% AI medical necessity
  // This is where AI actually contributes to the final confidence score
  const aiScore = aiContext.medical_necessity_score;
  const blended = (ruleConfidence * 0.6) + (aiScore * 0.4);

  // AI flags reduce confidence
  const flagPenalty = (aiContext.flags?.length || 0) * 0.03;

  return Math.max(0.1, Math.min(1.0, blended - flagPenalty));
}
