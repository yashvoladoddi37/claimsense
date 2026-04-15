// ============================================================
// Step 3: Coverage Verification
// - Check if treatment/service is covered
// - Check exclusions
// - Check pre-authorization requirements
// ============================================================

import { ClaimInput, StepResult, RejectionReason } from '../types';
import {
  getExclusions,
  EXCLUSION_KEYWORDS,
  getPreAuthTests,
  getCoveredDentalProcedures,
  getCoveredAltTreatments,
} from '../policy/terms';

function matchesExclusion(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [exclusion, keywords] of Object.entries(EXCLUSION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return exclusion;
      }
    }
  }
  return null;
}

export function checkCoverage(claim: ClaimInput): StepResult {
  const reasons: RejectionReason[] = [];
  const details: string[] = [];
  const rejectedItems: string[] = [];
  let partialAmount = 0;

  const prescription = claim.documents.prescription;
  const bill = claim.documents.bill;

  if (!prescription || !bill) {
    return {
      step: 'Coverage Check',
      passed: true, // Documents step already catches this
      decision_impact: 'NONE',
      reasons: [],
      details: 'Skipped — insufficient documents for coverage check.',
    };
  }

  // 1. Check diagnosis against exclusions
  const diagnosis = prescription.diagnosis || '';
  const diagnosisExclusion = matchesExclusion(diagnosis);
  if (diagnosisExclusion) {
    reasons.push('SERVICE_NOT_COVERED');
    details.push(`Treatment for "${diagnosis}" falls under excluded category: ${diagnosisExclusion}.`);
    return {
      step: 'Coverage Check',
      passed: false,
      decision_impact: 'REJECT',
      reasons,
      details: details.join(' '),
    };
  } else {
    details.push(`Diagnosis "${diagnosis}" is covered under policy.`);
  }

  // 2. Check treatment/procedures against exclusions
  const treatment = prescription.treatment || '';
  const treatmentExclusion = matchesExclusion(treatment);
  if (treatmentExclusion) {
    reasons.push('SERVICE_NOT_COVERED');
    details.push(`Treatment "${treatment}" falls under excluded category: ${treatmentExclusion}.`);
    return {
      step: 'Coverage Check',
      passed: false,
      decision_impact: 'REJECT',
      reasons,
      details: details.join(' '),
    };
  } else if (treatment) {
    details.push(`Treatment "${treatment}" is a covered service.`);
  }

  // 3. Check individual procedures for partial coverage
  if (prescription.procedures) {
    for (const proc of prescription.procedures) {
      const procExclusion = matchesExclusion(proc);
      if (procExclusion) {
        rejectedItems.push(`${proc} - ${procExclusion.toLowerCase()}`);
        const procKey = proc.toLowerCase().replace(/\s+/g, '_');
        const amount = bill[procKey] as number | undefined;
        if (amount) {
          partialAmount += amount;
        }
      } else {
        details.push(`Procedure "${proc}" verified as covered.`);
      }
    }
  }

  // 4. Check ALL bill items for cosmetic/excluded procedures
  const cosmeticKeywords = ['whitening', 'botox', 'liposuction', 'rhinoplasty', 'cosmetic', 'bleaching'];
  const weightLossKeywords = ['diet_plan', 'weight_loss', 'bariatric', 'slimming'];

  for (const [key, value] of Object.entries(bill)) {
    if (typeof value !== 'number' || value <= 0) continue;
    const keyLower = key.toLowerCase();

    // Cosmetic procedure detection
    if (cosmeticKeywords.some(kw => keyLower.includes(kw))) {
      const readableName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (!rejectedItems.some(r => r.toLowerCase().includes('whitening') || r.toLowerCase().includes('cosmetic'))) {
        rejectedItems.push(`${readableName} - cosmetic procedure`);
        partialAmount += value;
      }
    }

    // Weight loss treatment detection
    if (weightLossKeywords.some(kw => keyLower.includes(kw))) {
      const readableName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const dietExclusion = matchesExclusion('diet plan weight loss');
      if (dietExclusion && !rejectedItems.some(r => r.toLowerCase().includes('diet') || r.toLowerCase().includes('weight'))) {
        rejectedItems.push(`${readableName} - ${dietExclusion.toLowerCase()}`);
        partialAmount += value;
      }
    }
  }

  // 5. Check pre-authorization for tests
  const preAuthTests = getPreAuthTests();
  const claimedTests = prescription.tests_prescribed || bill.test_names || [];
  let preAuthNeeded = false;

  for (const test of claimedTests) {
    const testLower = test.toLowerCase();
    for (const preAuthTest of preAuthTests) {
      if (testLower.includes(preAuthTest.toLowerCase())) {
        reasons.push('PRE_AUTH_MISSING');
        details.push(`${preAuthTest} requires pre-authorization.`);
        preAuthNeeded = true;
      }
    }
    if (!preAuthNeeded && test) {
      details.push(`No pre-authorization required for test "${test}".`);
    }
  }

  // Also check bill keys for MRI/CT
  const billKeysLower = Object.entries(bill)
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([k]) => k.toLowerCase());
  if (billKeysLower.some(k => k.includes('mri') || k.includes('ct_scan'))) {
    if (!reasons.includes('PRE_AUTH_MISSING')) {
      reasons.push('PRE_AUTH_MISSING');
      details.push('MRI/CT scan requires pre-authorization for claims above ₹10000.');
    }
  }

  // Determine outcome
  if (reasons.length > 0 && reasons.includes('PRE_AUTH_MISSING')) {
    return {
      step: 'Coverage Check',
      passed: false,
      decision_impact: 'REJECT',
      reasons,
      details: details.join(' '),
    };
  }

  if (rejectedItems.length > 0) {
    const approvedAmount = claim.claim_amount - partialAmount;
    return {
      step: 'Coverage Check',
      passed: false,
      decision_impact: 'PARTIAL',
      reasons: ['EXCLUDED_CONDITION'],
      details: `Partial coverage: ${rejectedItems.join('; ')}. Approved portion: ₹${approvedAmount}. ${details.join(' ')}`,
      adjustments: {
        approved_amount: approvedAmount,
        rejected_items: rejectedItems,
      },
    };
  }

  return {
    step: 'Coverage Check',
    passed: true,
    decision_impact: 'NONE',
    reasons: [],
    details: details.join(' '),
  };
}
