// ============================================================
// Step 1: Basic Eligibility Check
// - Policy active on treatment date
// - Waiting period satisfied
// - Member is covered
// ============================================================

import { ClaimInput, StepResult } from '../types';
import { Member } from '../types';
import {
  getInitialWaitingDays,
  getSpecificAilmentWaiting,
} from '../policy/terms';

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function checkEligibility(
  claim: ClaimInput,
  member: Member | null
): StepResult {
  const reasons: StepResult['reasons'] = [];
  const details: string[] = [];

  // 1. Member exists?
  if (!member) {
    if (claim.strict_mode === false) {
      details.push(`[TEST MODE] Member ${claim.member_id} not found, but assuming valid for testing.`);
    } else {
      return {
        step: 'Eligibility Check',
        passed: false,
        decision_impact: 'REJECT',
        reasons: ['MEMBER_NOT_COVERED'],
        details: `Member ${claim.member_id} not found in policy records.`,
      };
    }
  }

  // Use dummy dates if member not found and in non-strict mode
  const policyStart = member?.policy_start_date || '2024-01-01';
  const joinDate = claim.member_join_date || member?.join_date || '2024-01-01';

  // 2. Policy active on treatment date?
  if (claim.treatment_date < policyStart) {
    reasons.push('POLICY_INACTIVE');
    details.push(
      `Policy started on ${policyStart}, but treatment was on ${claim.treatment_date}.`
    );
  } else {
    details.push(`Policy active (since ${policyStart}).`);
  }

  // 3. Waiting period check
  const daysSinceJoin = daysBetween(joinDate, claim.treatment_date);

  // Initial waiting period (30 days)
  const initialWaiting = getInitialWaitingDays();
  if (daysSinceJoin < initialWaiting) {
    reasons.push('WAITING_PERIOD');
    details.push(
      `Initial waiting period of ${initialWaiting} days not met. Member joined ${joinDate}, only ${daysSinceJoin} days before treatment.`
    );
  } else {
    details.push(`Initial ${initialWaiting}-day waiting period satisfied (${daysSinceJoin} days since join).`);
  }

  // Specific ailment waiting periods
  const diagnosis = claim.documents.prescription?.diagnosis?.toLowerCase() || '';
  const specificWaiting = getSpecificAilmentWaiting();
  let specificAilmentChecked = false;

  for (const [ailment, requiredDays] of Object.entries(specificWaiting)) {
    const ailmentLower = ailment.toLowerCase().replace('_', ' ');
    if (diagnosis.includes(ailmentLower)) {
      specificAilmentChecked = true;
      if (daysSinceJoin < requiredDays) {
        if (!reasons.includes('WAITING_PERIOD')) {
          reasons.push('WAITING_PERIOD');
        }
        const eligibleDate = new Date(joinDate);
        eligibleDate.setDate(eligibleDate.getDate() + requiredDays);
        details.push(
          `${ailment} has ${requiredDays}-day waiting period. Eligible from ${eligibleDate.toISOString().split('T')[0]}.`
        );
      } else {
        details.push(`Specific waiting period for ${ailment} (${requiredDays} days) satisfied.`);
      }
    }
  }

  if (!specificAilmentChecked && diagnosis) {
    details.push(`No specific ailment waiting periods applicable for "${diagnosis}".`);
  }

  return {
    step: 'Eligibility Check',
    passed: reasons.length === 0,
    decision_impact: reasons.length > 0 ? 'REJECT' : 'NONE',
    reasons,
    details: details.join(' '),
  };
}
