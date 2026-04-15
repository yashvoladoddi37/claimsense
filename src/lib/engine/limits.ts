// ============================================================
// Step 4: Limit Validation
// - Per-claim limit
// - Sub-limits by category
// - Annual limit (YTD)
// - Co-pay calculation
// - Network discount
// ============================================================

import { ClaimInput, StepResult, RejectionReason } from '../types';
import {
  getPerClaimLimit,
  getAnnualLimit,
  getConsultationCopay,
  getNetworkDiscount,
  isNetworkHospital,
  getCoveredAltTreatments,
  getDentalSubLimit,
  getDiagnosticSubLimit,
  getAltMedicineSubLimit,
  getPharmacySubLimit,
  getVisionSubLimit,
} from '../policy/terms';

interface LimitsContext {
  /** Total claims approved this year for this member (before current claim) */
  ytdApprovedAmount: number;
}

export function calculateLimits(
  claim: ClaimInput,
  context: LimitsContext = { ytdApprovedAmount: 0 },
  /** If coverage step already reduced amount (partial), use that */
  adjustedAmount?: number
): StepResult {
  const reasons: RejectionReason[] = [];
  const details: string[] = [];

  const baseAmount = adjustedAmount ?? claim.claim_amount;
  let workingAmount = baseAmount;

  // 1. Per-claim limit check
  const genericPerClaimLimit = getPerClaimLimit();
  const categoryLimit = getCategoryLimit(claim);
  const effectiveLimit = categoryLimit ?? genericPerClaimLimit;
  const amountToCheck = adjustedAmount || claim.claim_amount;

  if (amountToCheck > effectiveLimit) {
    reasons.push('PER_CLAIM_EXCEEDED');
    details.push(`Claim amount ₹${amountToCheck} exceeds limit of ₹${effectiveLimit}. Capped at limit.`);
    workingAmount = effectiveLimit;
  } else {
    details.push(`Claim amount ₹${amountToCheck} is within the ${categoryLimit ? 'category' : 'per-claim'} limit of ₹${effectiveLimit}.`);
  }

  // 2. Annual limit check
  const annualLimit = getAnnualLimit();
  const remainingAnnual = annualLimit - context.ytdApprovedAmount;
  if (workingAmount > remainingAnnual) {
    if (remainingAnnual <= 0) {
      reasons.push('ANNUAL_LIMIT_EXCEEDED');
      details.push(`Annual limit of ₹${annualLimit} has been fully utilized.`);
      return {
        step: 'Limits Check',
        passed: false,
        decision_impact: 'REJECT',
        reasons,
        details: details.join(' '),
      };
    } else {
      workingAmount = remainingAnnual;
      details.push(`Claim reduced to ₹${remainingAnnual} (remaining annual limit).`);
    }
  } else {
    details.push(`Remaining annual limit (₹${remainingAnnual}) is sufficient.`);
  }

  // 3. Network discount (applies BEFORE co-pay)
  let networkDiscount = 0;
  const isNetwork = claim.hospital && isNetworkHospital(claim.hospital);
  if (isNetwork) {
    const discountPct = getNetworkDiscount();
    networkDiscount = Math.round(workingAmount * discountPct / 100);
    workingAmount = workingAmount - networkDiscount;
    details.push(`Network discount (${discountPct}%): -₹${networkDiscount} applied.`);
  } else {
    details.push('No network discount applicable.');
  }

  // 4. Co-pay calculation
  let copayDeduction = 0;
  const isSpecialtyCategory = categoryLimit !== null;
  if (!isNetwork && !isSpecialtyCategory) {
    const copayPct = getConsultationCopay();
    copayDeduction = Math.round(workingAmount * copayPct / 100);
    workingAmount = workingAmount - copayDeduction;
    details.push(`Co-pay (${copayPct}%): -₹${copayDeduction} applied.`);
  } else {
    details.push(`No co-pay applicable (${isNetwork ? 'network hospital' : 'specialty category'}).`);
  }

  // 5. Minimum claim amount check
  if (claim.claim_amount < 500) {
    reasons.push('BELOW_MIN_AMOUNT' as RejectionReason);
    details.push(`Claim amount ₹${claim.claim_amount} is below minimum requirement of ₹500.`);
    return {
      step: 'Limits Check',
      passed: false,
      decision_impact: 'REJECT',
      reasons,
      details: details.join(' '),
    };
  } else {
    details.push(`Claim meets minimum amount requirement (₹${claim.claim_amount} >= ₹500).`);
  }

  const approvedAmount = Math.round(workingAmount);
  const perClaimCapped = reasons.includes('PER_CLAIM_EXCEEDED');

  return {
    step: 'Limits Check',
    passed: !perClaimCapped,
    decision_impact: perClaimCapped ? 'PARTIAL' : 'NONE',
    reasons,
    details: details.join(' '),
    adjustments: {
      approved_amount: approvedAmount,
      copay_deduction: copayDeduction,
      network_discount: networkDiscount,
    },
  };
}


/**
 * Detect if the claim is for alternative medicine (Ayurveda, Homeopathy, Unani).
 * These have their own sub-limit and no co-pay per policy terms.
 */
function isAlternativeMedicineClaim(claim: ClaimInput): boolean {
  const altTreatments = getCoveredAltTreatments().map(t => t.toLowerCase());
  const prescription = claim.documents.prescription;
  if (!prescription) return false;

  // Check doctor reg format (e.g., AYUR/KL/2345/2019)
  if (prescription.doctor_reg?.startsWith('AYUR')) return true;

  // Check treatment/diagnosis text
  const textToCheck = [
    prescription.treatment || '',
    prescription.diagnosis || '',
    ...(prescription.medicines_prescribed || []),
  ].join(' ').toLowerCase();

  return altTreatments.some(alt => textToCheck.includes(alt)) ||
    textToCheck.includes('panchakarma') ||
    textToCheck.includes('ayurved') ||
    textToCheck.includes('homeopath') ||
    textToCheck.includes('unani');
}

/**
 * Determine the category-specific sub-limit for a claim.
 * Returns the sub-limit if the claim falls into a recognized category,
 * or null if it's a general/mixed claim (use per-claim limit).
 */
function getCategoryLimit(claim: ClaimInput): number | null {
  const prescription = claim.documents.prescription;
  const bill = claim.documents.bill;
  if (!prescription) return null;

  const diagnosis = (prescription.diagnosis || '').toLowerCase();
  const treatment = (prescription.treatment || '').toLowerCase();
  const procedures = (prescription.procedures || []).map(p => p.toLowerCase());

  // Dental claims — check bill keys for dental-related keywords too
  const billKeys = bill ? Object.keys(bill).map(k => k.toLowerCase()) : [];
  if (diagnosis.includes('tooth') || diagnosis.includes('dental') ||
      diagnosis.includes('root canal') || diagnosis.includes('cavity') ||
      diagnosis.includes('pulpitis') || diagnosis.includes('molar') ||
      procedures.some(p => p.includes('root canal') || p.includes('filling') ||
        p.includes('extraction') || p.includes('cleaning')) ||
      billKeys.some(k => k.includes('root_canal') || k.includes('dental') ||
        k.includes('filling') || k.includes('extraction'))) {
    return getDentalSubLimit();
  }

  // Diagnostic test claims (standalone)
  if (billKeys.some(k => k.includes('mri') || k.includes('ct_scan') || k.includes('x_ray') ||
      k.includes('ultrasound') || k.includes('diagnostic'))) {
    const total = Object.entries(bill || {})
      .filter(([k]) => !k.includes('consultation'))
      .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);
    if (total > 0) {
      const consultFee = Object.entries(bill || {})
        .filter(([k]) => k.includes('consultation'))
        .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);
      if (!consultFee || consultFee / claim.claim_amount < 0.3) {
        return getDiagnosticSubLimit();
      }
    }
  }

  // Alternative medicine
  if (isAlternativeMedicineClaim(claim)) {
    return getAltMedicineSubLimit();
  }

  // Vision
  if (diagnosis.includes('eye') || diagnosis.includes('vision') || diagnosis.includes('myopia')) {
    return getVisionSubLimit();
  }

  return null; // General claim — use per-claim limit
}