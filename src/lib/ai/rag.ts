// ============================================================
// RAG Knowledge Base
// Auto-chunks policy_terms.json and adjudication_rules.md into
// an in-memory vector store. Uses Gemini embeddings + cosine
// similarity for retrieval. Medical knowledge added as supplementary.
// ============================================================

import policyData from '../../../policy_terms.json';
import fs from 'fs';
import path from 'path';

// ---- Local Embeddings via HuggingFace transformers.js ----
// Uses all-MiniLM-L6-v2 (384-dim) — runs on CPU, no API key needed
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

let embeddingPipeline: FeatureExtractionPipeline | null = null;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    const { pipeline } = await import('@huggingface/transformers');
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    ) as FeatureExtractionPipeline;
  }
  return embeddingPipeline;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  source: 'policy_terms' | 'adjudication_rules' | 'medical_knowledge';
  category: string;
  embedding?: number[];
}

export interface RetrievalResult {
  chunk: KnowledgeChunk;
  similarity: number;
}

// In-memory vector store
let knowledgeBase: KnowledgeChunk[] = [];
let isInitialized = false;
let isInitializing = false;

/** Whether the embedding model has been loaded and chunks are embedded */
export function isEmbeddingReady(): boolean {
  return isInitialized && knowledgeBase.some(c => c.embedding);
}

/** Whether the knowledge base is currently initializing (downloading model) */
export function isEmbeddingInitializing(): boolean {
  return isInitializing && !isInitialized;
}

// ---- Cosine Similarity ----
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---- Auto-chunk policy_terms.json ----
function chunkPolicyTerms(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  const p = policyData;
  let idx = 0;

  // Coverage limits
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'coverage_limits',
    text: `Policy: ${p.policy_name} (${p.policy_id}). Annual OPD limit: Rs ${p.coverage_details.annual_limit}. Per claim limit: Rs ${p.coverage_details.per_claim_limit}. Family floater limit: Rs ${p.coverage_details.family_floater_limit}. Effective from: ${p.effective_date}.` });

  // Consultation
  const cf = p.coverage_details.consultation_fees;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'consultation',
    text: `Consultation fees: covered=${cf.covered}, sub-limit Rs ${cf.sub_limit}, copay ${cf.copay_percentage}%, network discount ${cf.network_discount}%.` });

  // Diagnostics
  const dt = p.coverage_details.diagnostic_tests;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'diagnostics',
    text: `Diagnostic tests: covered=${dt.covered}, sub-limit Rs ${dt.sub_limit}, pre-authorization required=${dt.pre_authorization_required}. Covered tests: ${dt.covered_tests.join(', ')}.` });

  // Pharmacy
  const ph = p.coverage_details.pharmacy;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'pharmacy',
    text: `Pharmacy: covered=${ph.covered}, sub-limit Rs ${ph.sub_limit}, generic drugs mandatory=${ph.generic_drugs_mandatory}, branded drugs copay ${ph.branded_drugs_copay}%.` });

  // Dental
  const dn = p.coverage_details.dental;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'dental',
    text: `Dental: covered=${dn.covered}, sub-limit Rs ${dn.sub_limit}, routine checkup limit Rs ${dn.routine_checkup_limit}. Procedures covered: ${dn.procedures_covered.join(', ')}. Cosmetic dental: ${dn.cosmetic_procedures}.` });

  // Vision
  const vs = p.coverage_details.vision;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'vision',
    text: `Vision: covered=${vs.covered}, sub-limit Rs ${vs.sub_limit}, eye tests covered=${vs.eye_test_covered}, glasses/contacts=${vs.glasses_contact_lenses}, LASIK=${vs.lasik_surgery}.` });

  // Alt medicine
  const am = p.coverage_details.alternative_medicine;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'alternative_medicine',
    text: `Alternative medicine: covered=${am.covered}, sub-limit Rs ${am.sub_limit}, max ${am.therapy_sessions_limit} therapy sessions/year. Covered: ${am.covered_treatments.join(', ')}.` });

  // Waiting periods
  const wp = p.waiting_periods;
  const ailments = Object.entries(wp.specific_ailments).map(([k, v]) => `${k}: ${v} days`).join(', ');
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'waiting_periods',
    text: `Waiting periods: initial ${wp.initial_waiting} days, pre-existing diseases ${wp.pre_existing_diseases} days, maternity ${wp.maternity} days. Specific ailments: ${ailments}.` });

  // Exclusions
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'exclusions',
    text: `Exclusions: ${p.exclusions.join('; ')}.` });

  // Claim requirements
  const cr = p.claim_requirements;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'claim_requirements',
    text: `Claim requirements: Submit within ${cr.submission_timeline_days} days. Minimum claim Rs ${cr.minimum_claim_amount}. Required documents: ${cr.documents_required.join('; ')}.` });

  // Network hospitals
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'network',
    text: `Network hospitals: ${p.network_hospitals.join(', ')}. Cashless: available=${p.cashless_facilities.available}, network only=${p.cashless_facilities.network_only}, instant approval limit Rs ${p.cashless_facilities.instant_approval_limit}.` });

  return chunks;
}

// ---- Auto-chunk adjudication_rules.md ----
function chunkAdjudicationRules(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  // Read the actual markdown file
  let rulesText = '';
  try {
    const rulesPath = path.join(process.cwd(), '..', 'adjudication_rules.md');
    rulesText = fs.readFileSync(rulesPath, 'utf-8');
  } catch {
    try {
      const altPath = path.join(process.cwd(), 'adjudication_rules.md');
      rulesText = fs.readFileSync(altPath, 'utf-8');
    } catch {
      // Fallback if file not found — should not happen in production
      rulesText = '';
    }
  }

  if (!rulesText) return chunks;

  // Split by ## headers into sections
  const sections = rulesText.split(/^## /m).filter(Boolean);
  let idx = 0;

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0]?.trim() || 'unknown';
    const body = lines.slice(1).join('\n').trim();

    if (!body) continue;

    // Split large sections by ### sub-headers
    const subsections = body.split(/^### /m).filter(Boolean);

    if (subsections.length > 1) {
      for (const sub of subsections) {
        const subLines = sub.trim().split('\n');
        const subTitle = subLines[0]?.trim() || '';
        const subBody = subLines.slice(1).join(' ').replace(/\s+/g, ' ').trim();
        if (subBody.length > 20) {
          chunks.push({
            id: `ar-${idx++}`,
            source: 'adjudication_rules',
            category: `${title}/${subTitle}`.toLowerCase().replace(/\s+/g, '_'),
            text: `${title} - ${subTitle}: ${subBody}`,
          });
        }
      }
    } else {
      // Single section — chunk as-is
      const flatBody = body.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (flatBody.length > 20) {
        chunks.push({
          id: `ar-${idx++}`,
          source: 'adjudication_rules',
          category: title.toLowerCase().replace(/\s+/g, '_'),
          text: `${title}: ${flatBody}`,
        });
      }
    }
  }

  return chunks;
}

// ---- Medical Knowledge (supplementary, domain expertise) ----
function buildMedicalKnowledge(): KnowledgeChunk[] {
  return [
    { id: 'mk-0', source: 'medical_knowledge', category: 'fever',
      text: 'Viral fever: paracetamol 650mg, rest, hydration. CBC and dengue tests appropriate for persistent fever. Antibiotics only for confirmed bacterial infection.' },
    { id: 'mk-1', source: 'medical_knowledge', category: 'dental',
      text: 'Root canal: medically necessary for severe tooth decay, abscess, or trauma. Average cost India Rs 5,000-15,000. Teeth whitening is cosmetic, not medically necessary.' },
    { id: 'mk-2', source: 'medical_knowledge', category: 'diabetes',
      text: 'Type 2 diabetes: Metformin first-line, Glimepiride add-on. Blood sugar monitoring (fasting/post-prandial) and HbA1c tests standard. Diabetes is pre-existing chronic condition.' },
    { id: 'mk-3', source: 'medical_knowledge', category: 'gastro',
      text: 'Gastroenteritis: antibiotics for bacterial type, probiotics for recovery, oral rehydration primary. Typical OPD cost Rs 1,000-3,000.' },
    { id: 'mk-4', source: 'medical_knowledge', category: 'musculoskeletal',
      text: 'Chronic joint/back pain: Panchakarma (Ayurveda) is recognized treatment. MRI for disc herniation needs clinical justification. Physiotherapy is standard non-surgical option.' },
    { id: 'mk-5', source: 'medical_knowledge', category: 'obesity',
      text: 'Obesity: bariatric consultation and diet plans classified as weight loss treatments. BMI above 30 is clinical obesity. Weight loss treatments typically excluded from OPD coverage in India.' },
    { id: 'mk-6', source: 'medical_knowledge', category: 'respiratory',
      text: 'Acute bronchitis: antibiotics for suspected bacterial cause, bronchodilators for wheezing. Resolves in 1-3 weeks. Standard OPD treatment.' },
    { id: 'mk-7', source: 'medical_knowledge', category: 'migraine',
      text: 'Migraine: Sumatriptan for acute episodes, Propranolol for prophylaxis. CT/MRI only to rule out secondary causes, not routine.' },
  ];
}

// ---- Embed Chunks (local MiniLM-L6-v2) ----
async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  // result is a Tensor — convert to flat number array
  return Array.from(result.data as Float32Array);
}

export async function initializeKnowledgeBase(): Promise<void> {
  if (isInitialized) return;
  isInitializing = true;

  // Auto-chunk from actual source files + medical knowledge
  knowledgeBase = [
    ...chunkPolicyTerms(),
    ...chunkAdjudicationRules(),
    ...buildMedicalKnowledge(),
  ];

  console.log(`📚 Built ${knowledgeBase.length} knowledge chunks (policy: ${chunkPolicyTerms().length}, rules: ${chunkAdjudicationRules().length}, medical: ${buildMedicalKnowledge().length})`);

  try {
    // Batch embed all chunks using local model
    for (const chunk of knowledgeBase) {
      chunk.embedding = await embedText(chunk.text);
    }
    isInitialized = true;
    console.log(`✅ RAG knowledge base initialized with ${knowledgeBase.length} chunks`);
  } catch (error) {
    console.warn('⚠️  Failed to initialize RAG embeddings, falling back to keyword search:', error);
    isInitialized = true; // Mark as initialized even on failure — we'll use keyword fallback
  }
}

// ---- Retrieve ----
export async function retrieveContext(
  query: string,
  topK: number = 5,
  sourceFilter?: KnowledgeChunk['source']
): Promise<RetrievalResult[]> {
  if (!isInitialized) {
    await initializeKnowledgeBase();
  }

  let filteredChunks = knowledgeBase;
  if (sourceFilter) {
    filteredChunks = knowledgeBase.filter(c => c.source === sourceFilter);
  }

  let scored: RetrievalResult[] = [];

  // If embeddings are available, use vector search
  const hasEmbeddings = filteredChunks.some(c => c.embedding);
  if (hasEmbeddings) {
    try {
      const queryEmbedding = await embedText(query);
      scored = filteredChunks
        .filter(c => c.embedding)
        .map(chunk => ({
          chunk,
          similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
        }))
        .sort((a, b) => b.similarity - a.similarity);
    } catch {
      // Fall through to keyword search
    }
  }

  if (scored.length === 0) {
    // Keyword fallback
    const queryWords = query.toLowerCase().split(/\s+/);
    scored = filteredChunks.map(chunk => {
      const chunkWords = chunk.text.toLowerCase();
      const matchCount = queryWords.filter(w => chunkWords.includes(w)).length;
      return { chunk, similarity: matchCount / queryWords.length };
    }).sort((a, b) => b.similarity - a.similarity);
  }

  // Source-diverse selection: ensure top results from each source are included
  // so that policy_terms (with actual values) aren't drowned out by rule descriptions
  if (!sourceFilter) {
    const sources = [...new Set(filteredChunks.map(c => c.source))];
    const perSource = Math.max(1, Math.floor(topK / sources.length));
    const diverse: RetrievalResult[] = [];
    const used = new Set<string>();

    // Pick top results per source
    for (const src of sources) {
      let count = 0;
      for (const r of scored) {
        if (r.chunk.source === src && !used.has(r.chunk.id) && count < perSource) {
          diverse.push(r);
          used.add(r.chunk.id);
          count++;
        }
      }
    }

    // Fill remaining slots with best overall results
    for (const r of scored) {
      if (diverse.length >= topK) break;
      if (!used.has(r.chunk.id)) {
        diverse.push(r);
        used.add(r.chunk.id);
      }
    }

    return diverse.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  return scored.slice(0, topK);
}

/** Format retrieval results as context string for LLM prompt */
export function formatRetrievedContext(results: RetrievalResult[]): string {
  if (results.length === 0) return 'No relevant context found.';
  return results
    .map((r, i) => `[${i + 1}] (${r.chunk.source}/${r.chunk.category}, relevance: ${(r.similarity * 100).toFixed(0)}%)\n${r.chunk.text}`)
    .join('\n\n');
}

/** Get knowledge base stats for display in UI */
export function getKnowledgeBaseStats() {
  const allChunks = [
    ...chunkPolicyTerms(),
    ...chunkAdjudicationRules(),
    ...buildMedicalKnowledge(),
  ];
  return {
    totalChunks: allChunks.length,
    bySource: {
      policy_terms: allChunks.filter(c => c.source === 'policy_terms').length,
      adjudication_rules: allChunks.filter(c => c.source === 'adjudication_rules').length,
      medical_knowledge: allChunks.filter(c => c.source === 'medical_knowledge').length,
    },
    embeddingsLoaded: knowledgeBase.some(c => c.embedding),
    chunks: allChunks.map(c => ({ id: c.id, source: c.source, category: c.category, textPreview: c.text.slice(0, 120) + '...', text: c.text })),
  };
}
