// ============================================================
// RAG Knowledge Base (Qdrant-backed)
// Auto-chunks policy_terms.json and adjudication_rules.md,
// embeds with HuggingFace MiniLM-L6-v2, stores in Qdrant Cloud.
// Falls back to in-memory if Qdrant is unavailable.
// ============================================================

import policyData from '../../../policy_terms.json';
import fs from 'fs';
import path from 'path';
import { qdrantClient, COLLECTION_NAME } from '../db/qdrant';

// ---- Local Embeddings via HuggingFace transformers.js ----
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

let isInitialized = false;
let isInitializing = false;
let useQdrant = true; // falls back to in-memory if Qdrant unavailable

// In-memory fallback store
let fallbackChunks: KnowledgeChunk[] = [];

/** Whether the embedding model has been loaded and chunks are stored */
export function isEmbeddingReady(): boolean {
  return isInitialized;
}

/** Whether the knowledge base is currently initializing */
export function isEmbeddingInitializing(): boolean {
  return isInitializing && !isInitialized;
}

// ---- Cosine Similarity (fallback only) ----
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

  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'coverage_limits',
    text: `Policy: ${p.policy_name} (${p.policy_id}). Annual OPD limit: Rs ${p.coverage_details.annual_limit}. Per claim limit: Rs ${p.coverage_details.per_claim_limit}. Family floater limit: Rs ${p.coverage_details.family_floater_limit}. Effective from: ${p.effective_date}.` });

  const cf = p.coverage_details.consultation_fees;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'consultation',
    text: `Consultation fees: covered=${cf.covered}, sub-limit Rs ${cf.sub_limit}, copay ${cf.copay_percentage}%, network discount ${cf.network_discount}%.` });

  const dt = p.coverage_details.diagnostic_tests;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'diagnostics',
    text: `Diagnostic tests: covered=${dt.covered}, sub-limit Rs ${dt.sub_limit}, pre-authorization required=${dt.pre_authorization_required}. Covered tests: ${dt.covered_tests.join(', ')}.` });

  const ph = p.coverage_details.pharmacy;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'pharmacy',
    text: `Pharmacy: covered=${ph.covered}, sub-limit Rs ${ph.sub_limit}, generic drugs mandatory=${ph.generic_drugs_mandatory}, branded drugs copay ${ph.branded_drugs_copay}%.` });

  const dn = p.coverage_details.dental;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'dental',
    text: `Dental: covered=${dn.covered}, sub-limit Rs ${dn.sub_limit}, routine checkup limit Rs ${dn.routine_checkup_limit}. Procedures covered: ${dn.procedures_covered.join(', ')}. Cosmetic dental: ${dn.cosmetic_procedures}.` });

  const vs = p.coverage_details.vision;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'vision',
    text: `Vision: covered=${vs.covered}, sub-limit Rs ${vs.sub_limit}, eye tests covered=${vs.eye_test_covered}, glasses/contacts=${vs.glasses_contact_lenses}, LASIK=${vs.lasik_surgery}.` });

  const am = p.coverage_details.alternative_medicine;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'alternative_medicine',
    text: `Alternative medicine: covered=${am.covered}, sub-limit Rs ${am.sub_limit}, max ${am.therapy_sessions_limit} therapy sessions/year. Covered: ${am.covered_treatments.join(', ')}.` });

  const wp = p.waiting_periods;
  const ailments = Object.entries(wp.specific_ailments).map(([k, v]) => `${k}: ${v} days`).join(', ');
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'waiting_periods',
    text: `Waiting periods: initial ${wp.initial_waiting} days, pre-existing diseases ${wp.pre_existing_diseases} days, maternity ${wp.maternity} days. Specific ailments: ${ailments}.` });

  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'exclusions',
    text: `Exclusions: ${p.exclusions.join('; ')}.` });

  const cr = p.claim_requirements;
  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'claim_requirements',
    text: `Claim requirements: Submit within ${cr.submission_timeline_days} days. Minimum claim Rs ${cr.minimum_claim_amount}. Required documents: ${cr.documents_required.join('; ')}.` });

  chunks.push({ id: `pt-${idx++}`, source: 'policy_terms', category: 'network',
    text: `Network hospitals: ${p.network_hospitals.join(', ')}. Cashless: available=${p.cashless_facilities.available}, network only=${p.cashless_facilities.network_only}, instant approval limit Rs ${p.cashless_facilities.instant_approval_limit}.` });

  return chunks;
}

// ---- Auto-chunk adjudication_rules.md ----
function chunkAdjudicationRules(): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  let rulesText = '';
  try {
    const rulesPath = path.join(process.cwd(), '..', 'adjudication_rules.md');
    rulesText = fs.readFileSync(rulesPath, 'utf-8');
  } catch {
    try {
      const altPath = path.join(process.cwd(), 'adjudication_rules.md');
      rulesText = fs.readFileSync(altPath, 'utf-8');
    } catch {
      rulesText = '';
    }
  }

  if (!rulesText) return chunks;

  const sections = rulesText.split(/^## /m).filter(Boolean);
  let idx = 0;

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0]?.trim() || 'unknown';
    const body = lines.slice(1).join('\n').trim();

    if (!body) continue;

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

// ---- Medical Knowledge ----
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

// ---- Embed Text ----
async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

// ---- Qdrant: ensure collection + upsert ----
async function ensureQdrantCollection(): Promise<void> {
  const result = await qdrantClient.collectionExists(COLLECTION_NAME);
  // result is { exists: boolean } object, not a plain boolean
  const exists = typeof result === 'boolean' ? result : result?.exists;
  if (!exists) {
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: { size: 384, distance: 'Cosine' },
    });
    console.log(`✅ Created Qdrant collection "${COLLECTION_NAME}"`);
  }
}

async function upsertToQdrant(chunks: KnowledgeChunk[]): Promise<void> {
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await qdrantClient.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch.map((chunk, idx) => ({
        id: i + idx,
        vector: chunk.embedding!,
        payload: {
          text: chunk.text,
          source: chunk.source,
          category: chunk.category,
          chunk_id: chunk.id,
        },
      })),
    });
  }
}

async function qdrantHasPoints(): Promise<boolean> {
  try {
    const info = await qdrantClient.getCollection(COLLECTION_NAME);
    return (info.points_count ?? 0) > 0;
  } catch {
    return false;
  }
}

// ---- Initialize ----
export async function initializeKnowledgeBase(): Promise<void> {
  if (isInitialized) return;
  isInitializing = true;

  const allChunks = [
    ...chunkPolicyTerms(),
    ...chunkAdjudicationRules(),
    ...buildMedicalKnowledge(),
  ];

  console.log(`📚 Built ${allChunks.length} knowledge chunks`);

  // Try Qdrant first
  try {
    await ensureQdrantCollection();
    const hasData = await qdrantHasPoints();

    if (!hasData) {
      console.log('⏳ Embedding and upserting chunks to Qdrant...');
      for (const chunk of allChunks) {
        chunk.embedding = await embedText(chunk.text);
      }
      await upsertToQdrant(allChunks);
      console.log(`✅ Upserted ${allChunks.length} chunks to Qdrant Cloud`);
    } else {
      console.log(`✅ Qdrant collection already has data, skipping upsert`);
    }

    useQdrant = true;
    isInitialized = true;
  } catch (error) {
    console.warn('⚠️ Qdrant unavailable, falling back to in-memory:', error);
    useQdrant = false;

    // Fallback: embed in-memory
    try {
      for (const chunk of allChunks) {
        chunk.embedding = await embedText(chunk.text);
      }
    } catch (embedError) {
      console.warn('⚠️ Embedding failed:', embedError);
    }
    fallbackChunks = allChunks;
    isInitialized = true;
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

  const queryEmbedding = await embedText(query);

  if (useQdrant) {
    return retrieveFromQdrant(queryEmbedding, topK, sourceFilter);
  }
  return retrieveFromMemory(queryEmbedding, topK, sourceFilter);
}

async function retrieveFromQdrant(
  queryEmbedding: number[],
  topK: number,
  sourceFilter?: string
): Promise<RetrievalResult[]> {
  const filter = sourceFilter
    ? { must: [{ key: 'source' as const, match: { value: sourceFilter } }] }
    : undefined;

  // For source-diverse results, query more and deduplicate
  const results = await qdrantClient.query(COLLECTION_NAME, {
    query: queryEmbedding,
    limit: topK * 2,
    with_payload: true,
    filter,
  });

  const mapped: RetrievalResult[] = results.points.map((point) => ({
    chunk: {
      id: (point.payload?.chunk_id as string) || String(point.id),
      text: point.payload?.text as string,
      source: point.payload?.source as KnowledgeChunk['source'],
      category: point.payload?.category as string,
    },
    similarity: point.score,
  }));

  // Source-diverse selection
  if (!sourceFilter) {
    const sources = [...new Set(mapped.map(r => r.chunk.source))];
    const perSource = Math.max(1, Math.floor(topK / sources.length));
    const diverse: RetrievalResult[] = [];
    const used = new Set<string>();

    for (const src of sources) {
      let count = 0;
      for (const r of mapped) {
        if (r.chunk.source === src && !used.has(r.chunk.id) && count < perSource) {
          diverse.push(r);
          used.add(r.chunk.id);
          count++;
        }
      }
    }

    for (const r of mapped) {
      if (diverse.length >= topK) break;
      if (!used.has(r.chunk.id)) {
        diverse.push(r);
        used.add(r.chunk.id);
      }
    }

    return diverse.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  return mapped.slice(0, topK);
}

function retrieveFromMemory(
  queryEmbedding: number[],
  topK: number,
  sourceFilter?: string
): RetrievalResult[] {
  let filteredChunks = fallbackChunks;
  if (sourceFilter) {
    filteredChunks = fallbackChunks.filter(c => c.source === sourceFilter);
  }

  const hasEmbeddings = filteredChunks.some(c => c.embedding);
  let scored: RetrievalResult[] = [];

  if (hasEmbeddings) {
    scored = filteredChunks
      .filter(c => c.embedding)
      .map(chunk => ({
        chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }

  if (scored.length === 0) {
    const queryWords = queryEmbedding.length === 0 ? [] : [];
    scored = filteredChunks.map(chunk => ({ chunk, similarity: 0.5 }));
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
    embeddingsLoaded: isInitialized,
    vectorStore: useQdrant ? 'qdrant' : 'in-memory',
    chunks: allChunks.map(c => ({ id: c.id, source: c.source, category: c.category, textPreview: c.text.slice(0, 120) + '...', text: c.text })),
  };
}
