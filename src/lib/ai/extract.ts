// ============================================================
// AI Document Extraction + Medical Review
// Uses open-source OCR (unpdf/tesseract.js) + Groq/Llama for
// structured extraction and RAG-powered medical review
// ============================================================

import { isGroqAvailable, groqGenerateJSON } from './groq';
import { extractRawText } from './ocr';
import { retrieveContext, formatRetrievedContext, RetrievalResult } from './rag';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT, buildMedicalReviewPrompt } from './prompts';
import { ExtractionResult } from '../types';

export interface AIExtractionResponse {
  extraction: ExtractionResult;
  ragContext: RetrievalResult[];
  medicalReview: {
    medical_necessity_score: number;
    reasoning: string;
    flags: string[];
    coverage_assessment: string;
    retrieved_context_used: string[];
  } | null;
}

/**
 * Extract structured data from document images/PDFs using open-source OCR + Groq LLM.
 * Step 1: OCR text extraction (unpdf for PDFs, tesseract.js for images)
 * Step 2: Groq/Llama structured extraction from raw text
 * Step 3: RAG retrieval + medical necessity review
 */
export async function extractFromDocuments(
  files: { base64: string; mimeType: string }[]
): Promise<AIExtractionResponse> {
  if (!isGroqAvailable()) {
    throw new Error('AI service unavailable — GROQ_API_KEY not configured');
  }

  // Step 1: Extract raw text from all documents using open-source OCR
  console.log(`📄 Running OCR on ${files.length} document(s)...`);
  const rawText = await extractRawText(files);

  if (!rawText.trim()) {
    throw new Error('OCR failed to extract any text from the uploaded documents');
  }

  console.log(`✅ OCR extracted ${rawText.length} characters`);

  // Step 2: Send raw text to Groq/Llama for structured extraction
  const extractionPrompt = `${EXTRACTION_SYSTEM_PROMPT}\n\nDOCUMENT TEXT (extracted via OCR):\n---\n${rawText}\n---\n\n${EXTRACTION_USER_PROMPT}`;

  const extraction = await groqGenerateJSON<ExtractionResult>(extractionPrompt, { temperature: 0.1 });
  // Inject raw_text from OCR if the model didn't include it
  if (!extraction.raw_text) {
    extraction.raw_text = rawText;
  }

  // Step 3: RAG retrieval + medical necessity review
  const diagnosis = extraction.diagnosis || '';
  const treatments = [
    ...(extraction.medicines_prescribed || []),
    ...(extraction.tests_prescribed || []),
    ...extraction.line_items.map(li => li.description),
  ].join(', ');

  const ragQuery = `${diagnosis} ${treatments}`;
  const ragResults = await retrieveContext(ragQuery, 5);

  let medicalReview = null;
  if (diagnosis) {
    const ragContextStr = formatRetrievedContext(ragResults);
    const reviewPrompt = buildMedicalReviewPrompt(
      diagnosis,
      extraction.line_items.map(li => li.description),
      extraction.medicines_prescribed || [],
      extraction.tests_prescribed || [],
      ragContextStr
    );

    try {
      medicalReview = await groqGenerateJSON<AIExtractionResponse['medicalReview'] & object>(reviewPrompt, { temperature: 0.2 });
    } catch (err) {
      console.warn('Medical review failed, continuing without it:', err);
    }
  }

  return {
    extraction,
    ragContext: ragResults,
    medicalReview,
  };
}

/**
 * Run medical review only (for JSON-path claims that skip document extraction).
 * Uses RAG to retrieve relevant context.
 */
export async function runMedicalReview(
  diagnosis: string,
  treatments: string[],
  medicines: string[],
  tests: string[]
): Promise<{ ragResults: RetrievalResult[]; medicalReview: Record<string, unknown> | null }> {
  const ragQuery = `${diagnosis} ${treatments.join(', ')} ${medicines.join(', ')} ${tests.join(', ')}`;
  const ragResults = await retrieveContext(ragQuery, 5);

  if (!isGroqAvailable()) {
    return { ragResults, medicalReview: null };
  }

  const ragContextStr = formatRetrievedContext(ragResults);
  const reviewPrompt = buildMedicalReviewPrompt(diagnosis, treatments, medicines, tests, ragContextStr);

  try {
    const medicalReview = await groqGenerateJSON(reviewPrompt, { temperature: 0.2 });
    return { ragResults, medicalReview };
  } catch {
    return { ragResults, medicalReview: null };
  }
}
