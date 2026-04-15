// ============================================================
// Hybrid OCR Pipeline
// 1. unpdf (digital PDFs) + tesseract.js (images) — free, local
// 2. Gemini Vision fallback — only for low-confidence / handwritten docs
// ============================================================

import { extractText, getDocumentProxy } from 'unpdf';
import { createWorker, Worker } from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Minimum confidence threshold — below this, escalate to Gemini Vision
const MIN_CONFIDENCE = 0.55;
const MIN_TEXT_LENGTH = 80;

let tesseractWorker: Worker | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker('eng');
  }
  return tesseractWorker;
}

function getGeminiVision() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const client = new GoogleGenerativeAI(key);
  // Using gemini-flash-latest which appeared in the available models list
  return client.getGenerativeModel({ model: 'gemini-flash-latest' });
}

// ---- Local extractors ----

async function extractTextFromPDF(base64: string): Promise<string> {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text || '';
  } catch (err) {
    console.warn('unpdf failed to extract text from PDF (might be scanned):', err);
    return '';
  }
}

async function extractTextFromImage(base64: string): Promise<{ text: string; confidence: number }> {
  const worker = await getTesseractWorker();
  const buffer = Buffer.from(base64, 'base64');
  const { data } = await worker.recognize(buffer);
  return { text: data.text, confidence: data.confidence / 100 };
}

// ---- Gemini Vision fallback ----

async function extractWithGeminiVision(base64: string, mimeType: string): Promise<string | null> {
  const model = getGeminiVision();
  if (!model) return null;

  console.log('🔭 Escalating to Gemini Vision for difficult document...');
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: 'Extract ALL readable text from this medical document. Return only the raw text, preserving layout as much as possible. No commentary.' },
      ],
    }],
    generationConfig: { temperature: 0.1 },
  });
  const text = result.response.text();
  console.log(`✅ Gemini Vision extracted: ${text.slice(0, 100)}...`);
  return text;
}

// ---- Main pipeline ----

export async function extractRawText(
  files: { base64: string; mimeType: string }[]
): Promise<string> {
  const texts: string[] = [];

  for (const file of files) {
    try {
      let text = '';
      let needsGeminiFallback = false;

      if (file.mimeType === 'application/pdf') {
        text = await extractTextFromPDF(file.base64);
        // Scanned PDFs return very little text via unpdf — trigger fallback
        needsGeminiFallback = text.trim().length < MIN_TEXT_LENGTH;
        if (needsGeminiFallback) {
          console.log(`📄 PDF text length: ${text.trim().length} — likely a scanned document, escalating...`);
        }
      } else if (file.mimeType.startsWith('image/')) {
        const ocr = await extractTextFromImage(file.base64);
        text = ocr.text;
        needsGeminiFallback = ocr.confidence < MIN_CONFIDENCE || text.trim().length < MIN_TEXT_LENGTH;
        if (needsGeminiFallback) {
          console.log(`📄 Tesseract confidence: ${(ocr.confidence * 100).toFixed(0)}% — below threshold, escalating...`);
        } else {
          console.log(`✅ Tesseract extracted: ${text.slice(0, 100)}...`);
        }
      }

      // Fallback to Gemini Vision for hard cases
      if (needsGeminiFallback) {
        const geminiText = await extractWithGeminiVision(file.base64, file.mimeType).catch((err) => {
          console.error('Gemini Vision fallback failed:', err);
          return null;
        });
        if (geminiText && geminiText.trim().length > text.trim().length) {
          text = geminiText;
        }
      }

      if (text.trim()) texts.push(text);
    } catch (err) {
      console.error(`OCR extraction failed for ${file.mimeType}:`, err);
    }
  }

  return texts.join('\n\n---\n\n');
}
