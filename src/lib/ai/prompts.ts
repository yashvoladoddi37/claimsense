// ============================================================
// Prompt Templates for Gemini AI
// ============================================================

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert medical document analyzer for an Indian health insurance company.
Your task is to extract structured data from medical documents (prescriptions, bills, diagnostic reports, pharmacy bills).

IMPORTANT RULES:
- If a field is not visible or readable, return null. Do NOT guess or hallucinate values.
- Amounts are in Indian Rupees (INR/₹).
- Doctor registration numbers follow format: StateCode/Number/Year (e.g., KA/45678/2015) or specialty prefix like AYUR/State/Number/Year.
- Categorize each line item into one of: consultation, diagnostic, pharmacy, dental, vision, alternative_medicine, other.
- For medicines, note if they are generic or branded drugs.
- Extract ALL dates in ISO format (YYYY-MM-DD).

EXCLUSIONS TO FLAG (from policy):
- Cosmetic procedures (whitening, botox, etc.)
- Weight loss treatments (bariatric, diet plans for weight loss)
- Experimental treatments
- Vitamins and supplements (unless for deficiency)

FEW-SHOT EXAMPLES:

Example 1 - Clean consultation bill:
Input: A bill showing "Dr. Sharma, Reg: KA/45678/2015, Diagnosis: Viral fever, Consultation: ₹1000, CBC test: ₹500"
Output: { patient_name: null, doctor: { name: "Dr. Sharma", registration_number: "KA/45678/2015" }, diagnosis: "Viral fever", line_items: [{ description: "Consultation fee", category: "consultation", amount: 1000 }, { description: "CBC test", category: "diagnostic", amount: 500 }], total_amount: 1500, medicines_prescribed: [], tests_prescribed: ["CBC"] }

Example 2 - Dental bill with excluded item:
Input: A bill showing "Root canal: ₹8000, Teeth whitening: ₹4000"
Output: { diagnosis: "Tooth decay requiring root canal", line_items: [{ description: "Root canal treatment", category: "dental", amount: 8000 }, { description: "Teeth whitening", category: "dental", amount: 4000 }], total_amount: 12000, extraction_notes: "Teeth whitening is a cosmetic procedure and may be excluded from coverage" }`;

export const EXTRACTION_USER_PROMPT = `Extract all structured data from the following medical document(s).
Return a JSON object with these fields:
{
  "documents_detected": [{ "document_type": "prescription|bill|diagnostic_report|pharmacy_bill", "confidence": 0.0-1.0 }],
  "patient_name": "string or null",
  "employee_id": "string or null (Look for Employee ID, Member ID, Policy Number, or similar identifiers like EMP001, MBR-12345678)",
  "treatment_date": "YYYY-MM-DD or null",
  "doctor": { "name": "string or null", "registration_number": "string or null", "qualification": "string or null", "clinic_hospital": "string or null" },
  "diagnosis": "string or null",
  "line_items": [{ "description": "string", "category": "consultation|diagnostic|pharmacy|dental|vision|alternative_medicine|other", "amount": number, "is_generic_drug": boolean }],
  "total_amount": number or null,
  "medicines_prescribed": ["string"],
  "tests_prescribed": ["string"],
  "extraction_notes": "any observations about document quality, potential exclusions, or concerns",
  "medical_necessity_score": 0.0-1.0,
  "medical_necessity_reasoning": "brief assessment of whether the treatment is medically justified for the diagnosis",
  "raw_text": "all readable text from the document"
}`;

export function buildMedicalReviewPrompt(
  diagnosis: string,
  treatments: string[],
  medicines: string[],
  tests: string[],
  ragContext: string
): string {
  return `You are a medical insurance reviewer for an Indian OPD insurance policy.

RELEVANT POLICY AND MEDICAL CONTEXT (retrieved from knowledge base):
${ragContext}

Given the following claim details, assess medical necessity and policy compliance.

Diagnosis: ${diagnosis}
Treatments/Procedures: ${treatments.join(', ') || 'None specified'}
Medicines Prescribed: ${medicines.join(', ') || 'None specified'}
Diagnostic Tests: ${tests.join(', ') || 'None specified'}

Evaluate:
1. Does the diagnosis justify the prescribed treatment?
2. Are the medicines appropriate for this diagnosis?
3. Are the diagnostic tests relevant?
4. Is there anything unusual, suspicious, or potentially excluded?
5. Based on the retrieved policy context, is this claim likely covered?

Return a JSON object:
{
  "medical_necessity_score": 0.0-1.0,
  "reasoning": "detailed assessment",
  "flags": ["list of concerns if any"],
  "coverage_assessment": "brief statement on whether policy covers this",
  "retrieved_context_used": ["which retrieved chunks were most relevant"]
}`;
}
