// ============================================================
// Step 6: AI Medical Necessity Review
// This step uses the Gemini medical review + RAG context
// to validate that the treatment is medically appropriate.
// It feeds BACK into the pipeline — low scores trigger MANUAL_REVIEW.
// ============================================================

import { ClaimInput, StepResult, AIContext } from '../types';

/**
 * Evaluate medical necessity using AI context.
 * This is the step where AI actually influences the decision.
 * 
 * If no AI context is available (no API key), this step passes
 * with a note that AI review was skipped.
 */
export function reviewMedicalNecessity(
  claim: ClaimInput,
  aiContext?: AIContext
): StepResult {
  // If no AI context, pass with neutral result
  if (!aiContext || aiContext.medical_necessity_score === undefined) {
    return {
      step: 'AI Medical Review',
      passed: true,
      decision_impact: 'NONE',
      reasons: [],
      details: 'AI medical review not available — decision based on rule engine only.',
    };
  }

  const score = aiContext.medical_necessity_score;
  const flags = aiContext.flags || [];
  const reasoning = aiContext.medical_necessity_reasoning || '';
  const ragChunks = aiContext.rag_chunks_used || [];

  const details: string[] = [];
  details.push(`Medical necessity score: ${(score * 100).toFixed(0)}% (AI-assessed).`);

  if (reasoning) {
    details.push(`AI reasoning: ${reasoning}`);
  }

  if (ragChunks.length > 0) {
    details.push(`Retrieved ${ragChunks.length} knowledge chunks for context.`);
  }

  // Low medical necessity → flag for manual review
  if (score < 0.4) {
    details.push('Treatment does not appear medically necessary based on AI analysis.');
    return {
      step: 'AI Medical Review',
      passed: false,
      decision_impact: 'MANUAL_REVIEW',
      reasons: ['NOT_MEDICALLY_NECESSARY'],
      details: details.join(' '),
    };
  }

  // Medium confidence → add flags but don't block
  if (score < 0.7) {
    details.push('Moderate medical necessity — flagged for additional review.');
    if (flags.length > 0) {
      details.push(`AI flags: ${flags.join('; ')}.`);
    }
    return {
      step: 'AI Medical Review',
      passed: false,
      decision_impact: 'MANUAL_REVIEW',
      reasons: [],
      details: details.join(' '),
    };
  }

  // AI flags can also trigger manual review even with high score
  if (flags.length > 0) {
    details.push(`AI flags: ${flags.join('; ')}.`);
  }

  // High score → treatment is medically justified
  details.push('Treatment appears medically appropriate.');
  return {
    step: 'AI Medical Review',
    passed: true,
    decision_impact: 'NONE',
    reasons: [],
    details: details.join(' '),
  };
}
