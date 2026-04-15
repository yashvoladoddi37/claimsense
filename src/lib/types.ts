// ============================================================
// Core Types for the OPD Claim Adjudication System
// ============================================================

export type ClaimDecision = 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'MANUAL_REVIEW';
export type ClaimStatus = 'PROCESSING' | ClaimDecision | 'APPEALED';

export type DocumentType = 'prescription' | 'bill' | 'diagnostic_report' | 'pharmacy_bill';

export type LineItemCategory =
  | 'consultation'
  | 'diagnostic'
  | 'pharmacy'
  | 'dental'
  | 'vision'
  | 'alternative_medicine'
  | 'other';

// Rejection reason codes from adjudication_rules.md
export type RejectionReason =
  | 'POLICY_INACTIVE' | 'WAITING_PERIOD' | 'MEMBER_NOT_COVERED'
  | 'MISSING_DOCUMENTS' | 'ILLEGIBLE_DOCUMENTS' | 'INVALID_PRESCRIPTION'
  | 'DOCTOR_REG_INVALID' | 'DATE_MISMATCH' | 'PATIENT_MISMATCH'
  | 'SERVICE_NOT_COVERED' | 'EXCLUDED_CONDITION' | 'PRE_AUTH_MISSING'
  | 'ANNUAL_LIMIT_EXCEEDED' | 'SUB_LIMIT_EXCEEDED' | 'PER_CLAIM_EXCEEDED'
  | 'NOT_MEDICALLY_NECESSARY' | 'EXPERIMENTAL_TREATMENT' | 'COSMETIC_PROCEDURE'
  | 'LATE_SUBMISSION' | 'DUPLICATE_CLAIM' | 'BELOW_MIN_AMOUNT';

// ---------- Input Types ----------

export interface ClaimLineItem {
  description: string;
  category: LineItemCategory;
  amount: number;
  is_generic_drug?: boolean;
}

export interface PrescriptionInput {
  doctor_name: string;
  doctor_reg: string;
  diagnosis: string;
  medicines_prescribed?: string[];
  tests_prescribed?: string[];
  procedures?: string[];
  treatment?: string;
  qualification?: string;
  clinic_hospital?: string;
}

export interface BillInput {
  consultation_fee?: number;
  diagnostic_tests?: number;
  medicines?: number;
  test_names?: string[];
  root_canal?: number;
  teeth_whitening?: number;
  mri_scan?: number;
  therapy_charges?: number;
  diet_plan?: number;
  [key: string]: number | string[] | undefined;
}

export interface ClaimInput {
  member_id: string;
  member_name: string;
  treatment_date: string;       // ISO date string
  claim_amount: number;
  hospital?: string;
  cashless_request?: boolean;
  previous_claims_same_day?: number;
  member_join_date?: string;    // ISO date string
  strict_mode?: boolean;        // If false, bypass member and doctor reg validation
  documents: {
    prescription?: PrescriptionInput;
    bill?: BillInput;
    diagnostic_report?: Record<string, unknown>;
  };
}

// ---------- Pipeline Types ----------

export interface StepResult {
  step: string;
  passed: boolean;
  decision_impact: 'NONE' | 'REJECT' | 'PARTIAL' | 'MANUAL_REVIEW';
  reasons: RejectionReason[];
  details: string;
  adjustments?: {
    approved_amount?: number;
    rejected_items?: string[];
    copay_deduction?: number;
    network_discount?: number;
  };
}

// AI-enhanced context passed into the pipeline
export interface AIContext {
  medical_necessity_score?: number;
  medical_necessity_reasoning?: string;
  flags?: string[];
  coverage_assessment?: string;
  rag_chunks_used?: { source: string; category: string; text: string; similarity: number }[];
}

export interface Decision {
  claim_id: string;
  decision: ClaimDecision;
  approved_amount: number;
  rejection_reasons: RejectionReason[];
  confidence_score: number;
  notes: string;
  next_steps: string;
  steps: StepResult[];
  cashless_approved?: boolean;
  network_discount?: number;
  ai_context?: AIContext;
  processing_time_ms: number;
}

// ---------- Member ----------

export interface Member {
  id: string;
  name: string;
  join_date: string;
  policy_start_date: string;
  policy_id: string;
}

// ---------- Extraction (AI Output) ----------

export interface ExtractionResult {
  documents_detected: { document_type: DocumentType; confidence: number }[];
  patient_name: string | null;
  employee_id: string | null;
  member_id: string | null;
  treatment_date: string | null;
  doctor: {
    name: string | null;
    registration_number: string | null;
    qualification: string | null;
    clinic_hospital: string | null;
  };
  diagnosis: string | null;
  line_items: ClaimLineItem[];
  total_amount: number | null;
  medicines_prescribed: string[];
  tests_prescribed: string[];
  extraction_notes: string;
  medical_necessity_score: number;
  medical_necessity_reasoning: string;
  raw_text: string;
}

// ---------- Line Item Decision (Visual Diff) ----------

export interface LineItemDecision {
  description: string;
  category: LineItemCategory;
  claimed_amount: number;
  approved_amount: number;
  status: 'approved' | 'rejected' | 'reduced';
  reason?: string;
}

// ---------- Explainability ----------

export interface Counterfactual {
  condition: string;
  result: string;
  icon: string;
}

export interface DecisionExplanation {
  summary: string;              // Natural language explanation
  key_factors: string[];        // Bullet points of main factors
  policy_references: string[];  // Which policy sections were triggered
  counterfactuals: Counterfactual[];
  confidence_breakdown: {
    rule_engine: number;
    ai_medical: number;
    blended: number;
  };
  line_items: LineItemDecision[];
  amount_waterfall: {
    label: string;
    amount: number;
    type: 'start' | 'deduction' | 'addition' | 'total';
  }[];
}
