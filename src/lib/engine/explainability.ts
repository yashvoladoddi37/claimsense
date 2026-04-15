// ============================================================
// Explainability Engine
// Generates natural language explanations, counterfactuals,
// visual diff data, and confidence breakdowns from decisions.
// ============================================================

import {
  Decision, StepResult, ClaimInput, AIContext,
  DecisionExplanation, LineItemDecision, Counterfactual,
} from '../types';

// Policy section references for each pipeline step
const POLICY_REFS: Record<string, string> = {
  'Eligibility Check': 'Policy Terms → Waiting Periods (Section 4)',
  'Document Validation': 'Claim Requirements → Documents Required (Section 6)',
  'Coverage Check': 'Coverage Details → Exclusions (Section 3)',
  'Limits Check': 'Coverage Details → Annual/Per-Claim Limits (Section 2)',
  'Fraud Detection': 'Adjudication Rules → Fraud Indicators (Section 7)',
  'AI Medical Review': 'Adjudication Rules → Medical Necessity Review (Section 5)',
};

// Rejection reason → plain English mapping
const REASON_EXPLANATIONS: Record<string, string> = {
  POLICY_INACTIVE: 'The policy was not active on the date of treatment.',
  WAITING_PERIOD: 'The treatment was during a waiting period. Different conditions have different waiting periods before coverage begins.',
  MEMBER_NOT_COVERED: 'The member was not found in the policy records.',
  MISSING_DOCUMENTS: 'Required documents were not submitted with the claim.',
  ILLEGIBLE_DOCUMENTS: 'Some documents could not be read clearly.',
  INVALID_PRESCRIPTION: 'The prescription was missing or invalid.',
  DOCTOR_REG_INVALID: 'The doctor\'s registration number was missing or did not match the expected format.',
  DATE_MISMATCH: 'The dates across documents were inconsistent.',
  PATIENT_MISMATCH: 'Patient details did not match the policy records.',
  SERVICE_NOT_COVERED: 'The treatment or service is not covered under this policy.',
  EXCLUDED_CONDITION: 'Part of the treatment falls under policy exclusions.',
  PRE_AUTH_MISSING: 'This procedure requires pre-authorization, which was not obtained.',
  ANNUAL_LIMIT_EXCEEDED: 'The total claims for the year have exceeded the annual limit.',
  SUB_LIMIT_EXCEEDED: 'The claim exceeds the category-specific sub-limit.',
  PER_CLAIM_EXCEEDED: 'The claim amount exceeds the per-claim limit.',
  NOT_MEDICALLY_NECESSARY: 'The treatment was not deemed medically necessary for the diagnosis.',
  EXPERIMENTAL_TREATMENT: 'Experimental or unproven treatments are not covered.',
  COSMETIC_PROCEDURE: 'Cosmetic and aesthetic procedures are excluded.',
  LATE_SUBMISSION: 'The claim was submitted after the 30-day deadline.',
  DUPLICATE_CLAIM: 'This treatment has already been claimed.',
  BELOW_MIN_AMOUNT: 'The claim amount is below the ₹500 minimum.',
};

export function generateExplanation(
  decision: Decision,
  claim: ClaimInput,
  aiContext?: AIContext
): DecisionExplanation {
  const summary = buildSummary(decision, claim);
  const keyFactors = buildKeyFactors(decision);
  const policyRefs = buildPolicyReferences(decision.steps);
  const counterfactuals = buildCounterfactuals(decision, claim);
  const confidenceBreakdown = buildConfidenceBreakdown(decision, aiContext);
  const lineItems = buildLineItemDecisions(decision, claim);
  const waterfall = buildAmountWaterfall(decision, claim);

  return {
    summary,
    key_factors: keyFactors,
    policy_references: policyRefs,
    counterfactuals,
    confidence_breakdown: confidenceBreakdown,
    line_items: lineItems,
    amount_waterfall: waterfall,
  };
}

function buildSummary(decision: Decision, claim: ClaimInput): string {
  const name = claim.member_name;
  const amount = `₹${claim.claim_amount.toLocaleString()}`;
  const diagnosis = claim.documents.prescription?.diagnosis || 'the treatment';

  switch (decision.decision) {
    case 'APPROVED': {
      const approved = `₹${decision.approved_amount.toLocaleString()}`;
      if (decision.approved_amount === claim.claim_amount) {
        return `${name}'s claim of ${amount} for ${diagnosis} has been fully approved. All eligibility, documentation, coverage, and limits checks passed successfully.`;
      }
      return `${name}'s claim of ${amount} for ${diagnosis} has been approved for ${approved} after applicable deductions (co-pay and/or network discount).`;
    }
    case 'REJECTED': {
      const reasons = decision.rejection_reasons.map(r => REASON_EXPLANATIONS[r] || r).join(' ');
      return `${name}'s claim of ${amount} for ${diagnosis} has been rejected. ${reasons}`;
    }
    case 'PARTIAL': {
      const approved = `₹${decision.approved_amount.toLocaleString()}`;
      return `${name}'s claim of ${amount} for ${diagnosis} has been partially approved for ${approved}. Some items were excluded from coverage while others were approved.`;
    }
    case 'MANUAL_REVIEW':
      return `${name}'s claim of ${amount} for ${diagnosis} has been flagged for manual review. The automated system detected indicators that require human judgment before a decision can be made.`;
    default:
      return `Claim ${decision.claim_id} has been processed.`;
  }
}

function buildKeyFactors(decision: Decision): string[] {
  const factors: string[] = [];

  for (const step of decision.steps) {
    if (step.passed) {
      factors.push(`✅ ${step.step}: Passed — ${step.details.split('.')[0]}.`);
    } else {
      const impact = step.decision_impact === 'REJECT' ? '❌' : step.decision_impact === 'PARTIAL' ? '⚠️' : '🔍';
      factors.push(`${impact} ${step.step}: ${step.details.split('.')[0]}.`);
    }
  }

  return factors;
}

function buildPolicyReferences(steps: StepResult[]): string[] {
  return steps.map(s => POLICY_REFS[s.step] || s.step).filter(Boolean);
}

function buildCounterfactuals(decision: Decision, claim: ClaimInput): Counterfactual[] {
  const cfs: Counterfactual[] = [];

  if (decision.decision === 'APPROVED') return cfs;

  for (const step of decision.steps) {
    for (const reason of step.reasons) {
      switch (reason) {
        case 'PRE_AUTH_MISSING':
          cfs.push({
            condition: 'If pre-authorization had been obtained before the procedure',
            result: 'This claim would likely have been approved',
            icon: '📋',
          });
          break;
        case 'WAITING_PERIOD':
          cfs.push({
            condition: 'If the treatment date was after the waiting period ended',
            result: 'The claim would meet eligibility requirements',
            icon: '⏳',
          });
          break;
        case 'MISSING_DOCUMENTS':
          cfs.push({
            condition: 'If a valid prescription from a registered doctor was included',
            result: 'The claim could proceed through the adjudication pipeline',
            icon: '📄',
          });
          break;
        case 'PER_CLAIM_EXCEEDED': {
          // Extract the actual limit from the step details (e.g. "exceeds per-claim limit of ₹10000")
          const limitsStep = decision.steps.find(s => s.step === 'Limits Check');
          const limitMatch = limitsStep?.details?.match(/per-claim limit of ₹(\d+)/);
          const effectiveLimit = limitMatch ? `₹${Number(limitMatch[1]).toLocaleString()}` : '₹5,000';
          cfs.push({
            condition: `If the claim amount was ${effectiveLimit} or less (per-claim limit)`,
            result: 'The full claim amount would pass the limits check without being capped',
            icon: '💰',
          });
          break;
        }
        case 'SERVICE_NOT_COVERED':
          cfs.push({
            condition: 'If the treatment was for a covered medical condition',
            result: 'The claim would qualify for reimbursement',
            icon: '🏥',
          });
          break;
        case 'EXCLUDED_CONDITION':
          if (step.adjustments?.rejected_items) {
            cfs.push({
              condition: `If the excluded items (${step.adjustments.rejected_items.join(', ')}) were not part of the claim`,
              result: 'The full claim amount would be approved',
              icon: '🚫',
            });
          }
          break;
      }
    }
  }

  // Fraud-related
  if (decision.decision === 'MANUAL_REVIEW' && claim.previous_claims_same_day) {
    cfs.push({
      condition: 'If there were no other claims on the same day',
      result: 'The claim would not be flagged for fraud review',
      icon: '🔍',
    });
  }

  return cfs;
}

function buildConfidenceBreakdown(
  decision: Decision,
  aiContext?: AIContext
): { rule_engine: number; ai_medical: number; blended: number } {
  let ruleConfidence = 0.95;

  if (decision.decision === 'MANUAL_REVIEW') ruleConfidence = 0.65;
  else if (decision.decision === 'REJECTED') ruleConfidence = 0.97;
  else if (decision.decision === 'PARTIAL') ruleConfidence = 0.92;

  const aiScore = aiContext?.medical_necessity_score ?? ruleConfidence;
  const blended = decision.confidence_score;

  return { rule_engine: ruleConfidence, ai_medical: aiScore, blended };
}

function buildLineItemDecisions(decision: Decision, claim: ClaimInput): LineItemDecision[] {
  const items: LineItemDecision[] = [];
  const bill = claim.documents.bill;
  const prescription = claim.documents.prescription;
  if (!bill) return items;

  // If the overall claim is REJECTED, all line items should be rejected
  const isClaimRejected = decision.decision === 'REJECTED';

  const coverageStep = decision.steps.find(s => s.step === 'Coverage Check');
  const rejectedItems = coverageStep?.adjustments?.rejected_items as string[] | undefined || [];
  const rejectedLower = rejectedItems.map(r => r.toLowerCase());

  // Build the rejection reason for full-claim rejections
  const claimRejectionReason = isClaimRejected
    ? decision.rejection_reasons.map(r => REASON_EXPLANATIONS[r] || r).join('; ')
    : undefined;

  // Build from bill entries
  for (const [key, value] of Object.entries(bill)) {
    if (typeof value !== 'number' || value === 0) continue;

    const description = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const isItemRejected = isClaimRejected || rejectedLower.some(r => r.includes(key.replace(/_/g, ' ')));
    const category = inferCategory(key, prescription);

    items.push({
      description,
      category,
      claimed_amount: value,
      approved_amount: isItemRejected ? 0 : value,
      status: isItemRejected ? 'rejected' : 'approved',
      reason: isItemRejected
        ? (rejectedItems.find(r => r.toLowerCase().includes(key.replace(/_/g, ' '))) || claimRejectionReason)
        : undefined,
    });
  }

  return items;
}

function inferCategory(key: string, prescription?: { diagnosis?: string; treatment?: string }): 'consultation' | 'diagnostic' | 'pharmacy' | 'dental' | 'vision' | 'alternative_medicine' | 'other' {
  const k = key.toLowerCase();
  if (k.includes('consult')) return 'consultation';
  if (k.includes('diagnostic') || k.includes('test') || k.includes('mri') || k.includes('xray') || k.includes('cbc')) return 'diagnostic';
  if (k.includes('medicine') || k.includes('pharmacy')) return 'pharmacy';
  if (k.includes('dental') || k.includes('root_canal') || k.includes('teeth') || k.includes('whitening')) return 'dental';
  if (k.includes('eye') || k.includes('vision') || k.includes('lens')) return 'vision';
  if (k.includes('therapy') || k.includes('ayur') || k.includes('homeo')) return 'alternative_medicine';
  return 'other';
}

function buildAmountWaterfall(decision: Decision, claim: ClaimInput): DecisionExplanation['amount_waterfall'] {
  const waterfall: DecisionExplanation['amount_waterfall'] = [];

  waterfall.push({ label: 'Claimed Amount', amount: claim.claim_amount, type: 'start' });

  const coverageStep = decision.steps.find(s => s.step === 'Coverage Check');
  const coverageApproved = coverageStep?.adjustments?.approved_amount as number | undefined;
  if (coverageStep?.adjustments?.rejected_items) {
    const excluded = claim.claim_amount - (coverageApproved ?? claim.claim_amount);
    if (excluded > 0) {
      waterfall.push({ label: 'Excluded Items', amount: -excluded, type: 'deduction' });
    }
  }

  const limitsStep = decision.steps.find(s => s.step === 'Limits Check');
  if (limitsStep?.adjustments) {
    if (limitsStep.adjustments.network_discount && limitsStep.adjustments.network_discount > 0) {
      waterfall.push({ label: 'Network Discount', amount: -limitsStep.adjustments.network_discount, type: 'deduction' });
    }
    if (limitsStep.adjustments.copay_deduction && limitsStep.adjustments.copay_deduction > 0) {
      waterfall.push({ label: 'Co-pay (10%)', amount: -limitsStep.adjustments.copay_deduction, type: 'deduction' });
    }
  }

  // Use the decision's approved_amount, but if it's 0 and coverage approved something,
  // use the coverage-derived amount (handles cases where agent set wrong amount)
  let finalApproved = decision.approved_amount;
  if (finalApproved === 0 && coverageApproved && coverageApproved > 0 && decision.decision !== 'REJECTED') {
    finalApproved = coverageApproved;
  }

  waterfall.push({ label: 'Approved Amount', amount: finalApproved, type: 'total' });

  return waterfall;
}
