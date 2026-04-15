// ============================================================
// Policy Terms Loader - Typed accessors for policy_terms.json
// ============================================================

import policyData from '../../../policy_terms.json';

export const policy = policyData;

// ---------- Coverage Accessors ----------

export function getAnnualLimit(): number {
  return policy.coverage_details.annual_limit;
}

export function getPerClaimLimit(): number {
  return policy.coverage_details.per_claim_limit;
}

export function getConsultationSubLimit(): number {
  return policy.coverage_details.consultation_fees.sub_limit;
}

export function getConsultationCopay(): number {
  return policy.coverage_details.consultation_fees.copay_percentage;
}

export function getNetworkDiscount(): number {
  return policy.coverage_details.consultation_fees.network_discount;
}

export function getDiagnosticSubLimit(): number {
  return policy.coverage_details.diagnostic_tests.sub_limit;
}

export function getPharmacySubLimit(): number {
  return policy.coverage_details.pharmacy.sub_limit;
}

export function getBrandedDrugsCopay(): number {
  return policy.coverage_details.pharmacy.branded_drugs_copay;
}

export function getDentalSubLimit(): number {
  return policy.coverage_details.dental.sub_limit;
}

export function getVisionSubLimit(): number {
  return policy.coverage_details.vision.sub_limit;
}

export function getAltMedicineSubLimit(): number {
  return policy.coverage_details.alternative_medicine.sub_limit;
}

// ---------- Waiting Periods ----------

export function getInitialWaitingDays(): number {
  return policy.waiting_periods.initial_waiting;
}

export function getPreExistingWaitingDays(): number {
  return policy.waiting_periods.pre_existing_diseases;
}

export function getSpecificAilmentWaiting(): Record<string, number> {
  return policy.waiting_periods.specific_ailments;
}

// ---------- Exclusions ----------

export function getExclusions(): string[] {
  return policy.exclusions;
}

// Keyword map for fuzzy matching exclusions against diagnoses/treatments
export const EXCLUSION_KEYWORDS: Record<string, string[]> = {
  'Cosmetic procedures': ['cosmetic', 'aesthetic', 'whitening', 'botox', 'liposuction', 'beauty'],
  'Weight loss treatments': ['weight loss', 'bariatric', 'obesity', 'diet plan', 'slimming', 'bmi'],
  'Infertility treatments': ['infertility', 'ivf', 'fertility'],
  'Experimental treatments': ['experimental', 'clinical trial', 'investigational'],
  'Self-inflicted injuries': ['self-inflicted', 'self harm', 'suicide attempt'],
  'Adventure sports injuries': ['adventure sport', 'bungee', 'skydiving', 'paragliding'],
  'HIV/AIDS treatment': ['hiv', 'aids'],
  'Alcoholism/drug abuse treatment': ['alcoholism', 'drug abuse', 'substance abuse', 'addiction'],
  'Vitamins and supplements (unless prescribed for deficiency)': ['vitamin', 'supplement'],
};

// ---------- Covered Tests ----------

export function getCoveredTests(): string[] {
  return policy.coverage_details.diagnostic_tests.covered_tests;
}

// Tests that require pre-authorization (parsed from "MRI (with pre-auth)" format)
export function getPreAuthTests(): string[] {
  return policy.coverage_details.diagnostic_tests.covered_tests
    .filter((t: string) => t.includes('pre-auth'))
    .map((t: string) => t.replace(/\s*\(with pre-auth\)/i, '').trim());
}

// ---------- Network ----------

export function getNetworkHospitals(): string[] {
  return policy.network_hospitals;
}

export function isNetworkHospital(hospital: string): boolean {
  if (!hospital) return false;
  const lower = hospital.toLowerCase();
  return policy.network_hospitals.some(
    (h: string) => lower.includes(h.toLowerCase()) || h.toLowerCase().includes(lower)
  );
}

// ---------- Dental ----------

export function getCoveredDentalProcedures(): string[] {
  return policy.coverage_details.dental.procedures_covered;
}

// ---------- Alt Medicine ----------

export function getCoveredAltTreatments(): string[] {
  return policy.coverage_details.alternative_medicine.covered_treatments;
}

// ---------- Claim Requirements ----------

export function getSubmissionDeadlineDays(): number {
  return policy.claim_requirements.submission_timeline_days;
}

export function getMinimumClaimAmount(): number {
  return policy.claim_requirements.minimum_claim_amount;
}
