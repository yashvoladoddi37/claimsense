"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DecisionSummary,
  ConfidenceBreakdownViz,
  LineItemBreakdown,
  AmountWaterfall,
  CounterfactualsList,
  PolicyReferences,
} from "@/components/ClaimBreakdown";
import { VoiceClaimPanel } from "@/components/VoiceClaimPanel";

// --- Types ---
interface StepResult { step: string; passed: boolean; decision_impact: string; reasons: string[]; details: string; adjustments?: Record<string, unknown>; }

interface TestDocument {
  name: string;
  filename: string;
  path: string;
  type: "pdf" | "image";
  description: string;
  expectedOutcome: string;
  badgeColor: string;
}

const TEST_DOCUMENTS: TestDocument[] = [
  {
    name: "Consultation — Viral Fever",
    filename: "01_consultation_viral_fever.pdf",
    path: "/test-documents/01_consultation_viral_fever.pdf",
    type: "pdf",
    description: "Standard GP consultation for viral fever with prescription",
    expectedOutcome: "APPROVED",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
  {
    name: "Dental with Cosmetic",
    filename: "02_dental_with_cosmetic.pdf",
    path: "/test-documents/02_dental_with_cosmetic.pdf",
    type: "pdf",
    description: "Dental procedure with cosmetic teeth whitening (excluded)",
    expectedOutcome: "PARTIAL",
    badgeColor: "bg-amber-100 text-amber-800",
  },
  {
    name: "Diabetes Checkup",
    filename: "03_diabetes_checkup.pdf",
    path: "/test-documents/03_diabetes_checkup.pdf",
    type: "pdf",
    description: "Routine diabetes checkup with lab tests",
    expectedOutcome: "APPROVED",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
  {
    name: "Weight Loss (Excluded)",
    filename: "04_weight_loss_excluded.pdf",
    path: "/test-documents/04_weight_loss_excluded.pdf",
    type: "pdf",
    description: "Weight loss program — typically excluded from coverage",
    expectedOutcome: "REJECTED",
    badgeColor: "bg-[#b53333]/10 text-[#b53333]",
  },
  {
    name: "Pharmacy — Branded Drugs",
    filename: "05_pharmacy_branded_drugs.pdf",
    path: "/test-documents/05_pharmacy_branded_drugs.pdf",
    type: "pdf",
    description: "Pharmacy bill with branded medications",
    expectedOutcome: "PARTIAL",
    badgeColor: "bg-amber-100 text-amber-800",
  },
  {
    name: "Bill — Consultation TC001",
    filename: "bill_tc001.png",
    path: "/test-documents/bill_tc001.png",
    type: "image",
    description: "Sample medical bill image for consultation",
    expectedOutcome: "APPROVED",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
  {
    name: "Prescription — TC001",
    filename: "prescription_tc001.png",
    path: "/test-documents/prescription_tc001.png",
    type: "image",
    description: "Sample prescription image",
    expectedOutcome: "APPROVED",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
  {
    name: "Dental — TC002",
    filename: "dental_tc002.png",
    path: "/test-documents/dental_tc002.png",
    type: "image",
    description: "Sample dental bill image",
    expectedOutcome: "PARTIAL",
    badgeColor: "bg-amber-100 text-amber-800",
  },
];

const AGENT_META: Record<string, { icon: string; name: string; description: string }> = {
  'Eligibility Check': { icon: '🛡️', name: 'Eligibility Agent', description: 'Verifies policy status, waiting periods, and member coverage' },
  'Document Validation': { icon: '📄', name: 'Document Agent', description: 'Validates prescriptions, bills, and supporting documents' },
  'Coverage Check': { icon: '📋', name: 'Coverage Agent', description: 'Checks service coverage, exclusions, and pre-authorization' },
  'Limits Check': { icon: '💰', name: 'Limits Agent', description: 'Applies annual limits, sub-limits, co-pay, and deductions' },
  'Fraud Detection': { icon: '🔍', name: 'Fraud Detection Agent', description: 'Screens for duplicate claims, unusual patterns, and anomalies' },
  'AI Medical Review': { icon: '🧠', name: 'Medical Review Agent', description: 'AI-powered assessment of medical necessity using RAG context' },
};

const STATUS_BG: Record<string, string> = {
  APPROVED: "bg-emerald-50 border-emerald-300", REJECTED: "bg-[#b53333]/5 border-[#b53333]/30",
  PARTIAL: "bg-amber-50 border-amber-300", MANUAL_REVIEW: "bg-orange-50 border-orange-300",
};
const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-[#27a644]/15 text-[#27a644]", REJECTED: "bg-[#b53333]/10 text-[#b53333]",
  PARTIAL: "bg-amber-600/10 text-amber-700", MANUAL_REVIEW: "bg-orange-500/10 text-orange-700",
};
const STATUS_ICON: Record<string, string> = {
  APPROVED: "✅", REJECTED: "❌", PARTIAL: "⚠️", MANUAL_REVIEW: "🔍",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readSSEStream(
  res: Response,
  onStep: (step: StepResult) => void,
  onWarning: (msg: string) => void,
): Promise<Record<string, any>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalData: Record<string, any> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(trimmed.slice(6));
        if (event.type === 'final') finalData = event;
        else if (event.type === 'step') onStep(event.step as StepResult);
        else if (event.type === 'error') throw new Error(event.message);
        else if (event.type === 'warning') onWarning(event.message);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  if (!finalData) throw new Error('No response received from server');
  return finalData;
}

function getAgentRecommendation(step: StepResult): { label: string; color: string } {
  if (step.passed) return { label: 'PASS', color: 'bg-[#27a644]/15 text-[#27a644] border-emerald-300' };
  if (step.decision_impact === 'REJECT') return { label: 'DENY', color: 'bg-[#b53333]/10 text-[#b53333] border-[#b53333]/30' };
  if (step.decision_impact === 'PARTIAL') return { label: 'PARTIAL', color: 'bg-amber-600/10 text-amber-700 border-amber-300' };
  return { label: 'REVIEW', color: 'bg-orange-500/10 text-orange-700 border-orange-300' };
}

export default function SubmitClaim() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
  const [jsonInput, setJsonInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<TestDocument | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "pdf" | "image">("all");
  const [strictMode, setStrictMode] = useState(true);
  const [pipelineProgress, setPipelineProgress] = useState<number>(-1);
  const [liveSteps, setLiveSteps] = useState<StepResult[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  function toggleAgent(step: string) {
    setExpandedAgents(prev => ({ ...prev, [step]: !prev[step] }));
  }

  const addTestDocument = useCallback(async (doc: TestDocument) => {
    try {
      const res = await fetch(doc.path);
      const blob = await res.blob();
      const file = new File([blob], doc.filename, { type: doc.type === "pdf" ? "application/pdf" : "image/png" });
      setFiles(prev => {
        if (prev.some(f => f.name === doc.filename)) return prev;
        return [...prev, file];
      });
    } catch {
      // silently fail
    }
  }, []);

  async function handleDocSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setLoading(true);
    setResult(null);
    setExpandedAgents({});
    setLiveSteps([]);
    setPipelineProgress(0);
    setWarnings([]);

    const handleStep = (step: StepResult) => {
      setLiveSteps(prev => [...prev, step]);
      setPipelineProgress(prev => prev + 1);
    };

    try {
      const formData = new FormData();
      for (const file of files) formData.append("documents", file);
      formData.append("strict_mode", String(strictMode));

      const res = await fetch("/api/claims", { method: "POST", body: formData });
      const finalData = await readSSEStream(res, handleStep, (msg) => setWarnings(prev => [...prev, msg]));
      setResult(finalData);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setLoading(false);
      setPipelineProgress(-1);
    }
  }

  async function handleJsonSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setExpandedAgents({});
    setLiveSteps([]);
    setPipelineProgress(0);
    setWarnings([]);

    const handleStep = (step: StepResult) => {
      setLiveSteps(prev => [...prev, step]);
      setPipelineProgress(prev => prev + 1);
    };

    try {
      const parsed = JSON.parse(jsonInput);
      parsed.strict_mode = strictMode;
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const finalData = await readSSEStream(res, handleStep, (msg) => setWarnings(prev => [...prev, msg]));
      setResult(finalData);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setLoading(false);
      setPipelineProgress(-1);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (droppedFiles.length > 0) setFiles(prev => [...prev, ...droppedFiles]);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  // Extract data from result
  const status = result?.status as string | undefined;
  const decision = result?.decision;
  const explanation = result?.explanation;
  const pipeline: StepResult[] = decision?.steps || [];
  const aiContext = decision?.ai_context;
  const ragChunks = aiContext?.rag_chunks_used || [];

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto" style={{ background: '#faf9f5' }}>
      {/* ====== SIDEBAR — Test Documents ====== */}
      <div className={`shrink-0 transition-all duration-300 ${sidebarOpen ? "w-full lg:w-72" : "w-10"}`}>
        <div className="sticky top-20">
          {sidebarOpen ? (
            <div className="rounded-xl border-2 border-[#c96442]/30 shadow-lg ring-1 ring-[#c96442]/10" style={{ background: '#faf9f5' }}>
              <div className="p-4 pb-3 border-b border-[#e8e6dc]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: '#141413' }}>
                    🧪 Test Documents
                  </h3>
                  <button onClick={() => setSidebarOpen(false)} className="text-[#87867f] hover:text-[#141413] text-xs p-1.5 rounded-md hover:bg-[#f0eee6] transition-colors">
                    ✕
                  </button>
                </div>
                <p className="text-[11px] mt-1" style={{ color: '#5e5d59' }}>Pick sample docs to test the claim pipeline</p>

                {/* Filter Tabs */}
                <div className="flex gap-1 mt-3 p-0.5 rounded-lg" style={{ background: '#f0eee6' }}>
                  {(["all", "pdf", "image"] as const).map((f) => (
                    <button key={f} onClick={() => setSidebarFilter(f)}
                      className={`flex-1 text-[11px] px-2 py-1.5 rounded-md font-medium transition-all
                        ${sidebarFilter === f
                          ? "shadow-sm"
                          : ""}`}
                      style={sidebarFilter === f
                        ? { background: '#faf9f5', color: '#141413', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                        : { color: '#5e5d59' }}
                    >
                      {f === "all" ? `All (${TEST_DOCUMENTS.length})` : f === "pdf" ? `📑 PDF (${TEST_DOCUMENTS.filter(d => d.type === "pdf").length})` : `🖼️ IMG (${TEST_DOCUMENTS.filter(d => d.type === "image").length})`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                {TEST_DOCUMENTS
                  .filter(doc => sidebarFilter === "all" || doc.type === sidebarFilter)
                  .map((doc) => {
                  const isAdded = files.some(f => f.name === doc.filename);
                  return (
                    <div key={doc.filename}
                      className="rounded-lg border p-3 transition-all"
                      style={isAdded
                        ? { borderColor: 'rgba(201,100,66,0.4)', background: 'rgba(201,100,66,0.05)' }
                        : { borderColor: '#e8e6dc', background: '#f0eee6' }}
                    >
                      <p className="font-semibold text-xs leading-tight" style={{ color: '#141413' }}>{doc.name}</p>
                      <p className="text-[10px] mt-1 line-clamp-1" style={{ color: '#5e5d59' }}>{doc.description}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <Badge className={`text-[10px] px-1.5 py-0.5 ${doc.badgeColor}`}>
                          {doc.expectedOutcome}
                        </Badge>
                        <button
                          onClick={() => setPreviewDoc(previewDoc?.filename === doc.filename ? null : doc)}
                          className="text-[11px] px-3 py-1 rounded-md font-semibold transition-colors"
                          style={{ background: 'rgba(20,20,19,0.08)', color: '#141413' }}
                        >
                          {previewDoc?.filename === doc.filename ? "Hide" : "Preview"}
                        </button>
                        {isAdded ? (
                          <span className="text-[11px] px-3 py-1 rounded-md font-semibold ml-auto" style={{ background: 'rgba(201,100,66,0.15)', color: '#c96442' }}>Added ✓</span>
                        ) : (
                          <button
                            onClick={() => addTestDocument(doc)}
                            className="text-[11px] px-3 py-1 rounded-md bg-[#27a644]/15 text-[#27a644] hover:bg-[#27a644]/25 transition-colors font-semibold ml-auto"
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Quick add all */}
                <div className="pt-2 border-t border-[#e8e6dc] mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => {
                      const filtered = sidebarFilter === "all" ? TEST_DOCUMENTS : TEST_DOCUMENTS.filter(d => d.type === sidebarFilter);
                      filtered.forEach(doc => addTestDocument(doc));
                    }}
                  >
                    Add All {sidebarFilter === "all" ? "Test Docs" : sidebarFilter === "pdf" ? "PDFs" : "Images"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-10 h-10 rounded-lg border flex items-center justify-center hover:bg-[#f0eee6] transition-colors"
              style={{ background: '#faf9f5', borderColor: '#e8e6dc', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}
              title="Show test documents"
            >
              🧪
            </button>
          )}
        </div>
      </div>

      {/* ====== MAIN CONTENT ====== */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="text-center pt-4 relative">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#141413' }}>Submit New Claim</h1>
          <p className="text-sm mt-1" style={{ color: '#5e5d59' }}>Upload documents or paste JSON — ask the voice assistant about coverage and claim decisions</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 sm:mt-0 sm:absolute sm:right-0 sm:top-4 text-xs text-[#b53333] border-[#b53333]/20 hover:bg-[#b53333]/5 hover:border-[#b53333]/30"
            onClick={async () => {
              if (!confirm('Delete all claims and start fresh?')) return;
              await fetch('/api/claims', { method: 'DELETE' });
              setResult(null);
              setFiles([]);
              router.refresh();
            }}
          >
            Reset All Claims
          </Button>
        </div>

        {/* ====== VOICE ASSISTANT ====== */}
        <VoiceClaimPanel />

        {/* Preview Panel */}
        {previewDoc && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm" style={{ color: '#141413' }}>Preview: {previewDoc.name}</CardTitle>
                <button onClick={() => setPreviewDoc(null)} className="text-xs px-2 py-1 rounded hover:bg-[#f0eee6]" style={{ color: '#5e5d59' }}>Close</button>
              </div>
            </CardHeader>
            <CardContent>
              {previewDoc.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewDoc.path} alt={previewDoc.name} className="max-h-96 rounded-lg border mx-auto" />
              ) : (
                <iframe src={previewDoc.path} className="w-full h-96 rounded-lg border bg-white" title={previewDoc.name} />
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="documents">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents">📄 Upload Documents</TabsTrigger>
            <TabsTrigger value="json">🔧 JSON Input</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleDocSubmit} className="space-y-5">
                  {/* Strict Mode Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-[#e8e6dc]" style={{ background: '#f0eee6' }}>
                    <div>
                      <Label className="text-sm font-semibold" style={{ color: '#141413' }}>Strict Validation</Label>
                      <p className="text-[11px]" style={{ color: '#5e5d59' }}>Toggle OFF to assume Member ID and Doctor Reg are valid</p>
                    </div>
                    <div className="relative flex items-center h-6">
                      <input
                        type="checkbox"
                        checked={strictMode}
                        onChange={(e) => setStrictMode(e.target.checked)}
                        className="w-10 h-5 rounded-full appearance-none cursor-pointer transition-colors"
                        style={{
                          background: strictMode ? '#c96442' : '#87867f',
                          border: 'none',
                        }}
                      />
                      <div className={`absolute w-4 h-4 bg-white rounded-full transition-transform pointer-events-none transform ${strictMode ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </div>

                  {/* Drag & Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer
                      ${dragActive ? "border-[#c96442] scale-[1.01]" : "border-[#87867f]/25 hover:border-[#c96442]/50"}`}
                    style={dragActive ? { background: 'rgba(201,100,66,0.05)' } : { background: '#faf9f5' }}
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-4xl">📎</div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: '#141413' }}>Drop your bills, prescriptions, or medical documents here</p>
                        <p className="text-xs mt-1" style={{ color: '#5e5d59' }}>Supports images (JPG, PNG) and PDFs — claim details will be extracted automatically</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="mt-1">
                        Browse Files
                      </Button>
                    </div>
                    <Input
                      id="file-input"
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      onChange={(e) => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
                      className="hidden"
                    />
                  </div>

                  {/* File List */}
                  {files.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs uppercase tracking-wider" style={{ color: '#5e5d59' }}>{files.length} document{files.length > 1 ? "s" : ""} selected</Label>
                        <button type="button" onClick={() => setFiles([])}
                          className="text-xs hover:text-[#b53333] transition-colors" style={{ color: '#5e5d59' }}>
                          Clear all
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {files.map((file, i) => (
                          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border text-sm" style={{ background: '#f0eee6', borderColor: '#e8e6dc' }}>
                            <span className="text-lg">{file.type === "application/pdf" ? "📑" : "🖼️"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate" style={{ color: '#141413' }}>{file.name}</p>
                              <p className="text-xs" style={{ color: '#5e5d59' }}>{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button type="button" onClick={() => removeFile(i)}
                              className="text-xs px-2 py-1 rounded hover:bg-[#b53333]/5 transition-colors" style={{ color: '#5e5d59' }}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button type="submit" disabled={loading || files.length === 0} className="w-full h-11 text-base relative overflow-hidden group">
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : "Submit Claim"}
                    </span>
                    {loading && (
                      <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json">
            <Card>
              <CardHeader><CardTitle style={{ color: '#141413' }}>JSON Claim Input</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleJsonSubmit} className="space-y-4">
                  <Textarea rows={12} value={jsonInput} onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='Paste claim JSON here (same format as test_cases.json input_data)...' className="font-mono text-sm" />
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Processing..." : "Submit JSON Claim"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ======== LIVE AGENT OUTPUT ======== */}
        {pipelineProgress >= 0 && !result && (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3 px-1">
              <div className="relative h-5 w-5">
                <div className="absolute inset-0 rounded-full border-2 border-[#c96442]/30" />
                <div className="absolute inset-0 rounded-full border-2 border-[#c96442] border-t-transparent animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#141413' }}>
                  Adjudicating Claim — {liveSteps.length} agent{liveSteps.length !== 1 ? 's' : ''} reported
                </p>
                <p className="text-xs" style={{ color: '#5e5d59' }}>Each agent analyzes independently, then reports its decision and reasoning</p>
              </div>
            </div>

            {/* Live agent cards */}
            {liveSteps.map((step, i) => {
              const meta = AGENT_META[step.step] || { icon: '⚙️', name: step.step, description: '' };
              const rec = getAgentRecommendation(step);

              return (
                <div
                  key={i}
                  className="rounded-xl border-2 overflow-hidden animate-in slide-in-from-bottom-2 duration-400"
                  style={{
                    borderColor: step.passed ? 'rgba(39,166,68,0.25)' : step.decision_impact === 'REJECT' ? 'rgba(181,51,51,0.25)' : 'rgba(201,100,66,0.25)',
                    background: '#faf9f5',
                  }}
                >
                  {/* Agent header */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{
                    background: step.passed
                      ? 'linear-gradient(135deg, rgba(39,166,68,0.06), transparent)'
                      : step.decision_impact === 'REJECT'
                      ? 'linear-gradient(135deg, rgba(181,51,51,0.06), transparent)'
                      : 'linear-gradient(135deg, rgba(201,100,66,0.06), transparent)',
                  }}>
                    <span className="text-xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm" style={{ color: '#141413' }}>{meta.name}</span>
                      <span className="text-xs ml-2 hidden sm:inline" style={{ color: '#5e5d59' }}>{meta.description}</span>
                    </div>
                    <Badge className={`border text-xs font-bold ${rec.color}`}>{rec.label}</Badge>
                  </div>

                  {/* Agent reasoning body */}
                  <div className="px-4 pb-4 pt-2 space-y-3 border-t" style={{ borderColor: '#e8e6dc' }}>
                    {/* Decision + Reasoning */}
                    {step.details && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#87867f' }}>Reasoning</div>
                        <p className="text-sm leading-relaxed" style={{ color: '#4d4c48' }}>{step.details}</p>
                      </div>
                    )}

                    {/* Rejection reasons as proof */}
                    {step.reasons.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#87867f' }}>
                          {step.passed ? 'Codes' : 'Rejection Codes'}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {step.reasons.map((r, j) => (
                            <span key={j} className="text-xs font-mono px-2 py-1 rounded-md border" style={{
                              background: step.passed ? 'rgba(39,166,68,0.08)' : 'rgba(181,51,51,0.08)',
                              borderColor: step.passed ? 'rgba(39,166,68,0.2)' : 'rgba(181,51,51,0.2)',
                              color: step.passed ? '#27a644' : '#b53333',
                            }}>{r}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Adjustments as proof of calculations */}
                    {step.adjustments && Object.keys(step.adjustments).length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#87867f' }}>Adjustments Applied</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(step.adjustments).map(([k, v]) => (
                            <div key={k} className="rounded-lg border px-3 py-2" style={{ background: '#f0eee6', borderColor: '#e8e6dc' }}>
                              <div className="text-[10px] uppercase" style={{ color: '#87867f' }}>{k.replace(/_/g, ' ')}</div>
                              <div className="text-sm font-bold font-mono" style={{ color: '#141413' }}>
                                {typeof v === 'number' ? `₹${v.toLocaleString()}` : JSON.stringify(v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Impact indicator */}
                    {step.decision_impact !== 'NONE' && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] font-semibold uppercase" style={{ color: '#87867f' }}>Impact:</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          step.decision_impact === 'REJECT' ? 'bg-[#b53333]/10 text-[#b53333]'
                          : step.decision_impact === 'PARTIAL' ? 'bg-amber-600/10 text-amber-700'
                          : 'bg-orange-500/10 text-orange-700'
                        }`}>
                          {step.decision_impact === 'REJECT' ? 'Will reject claim'
                           : step.decision_impact === 'PARTIAL' ? 'Partial approval — amount reduced'
                           : 'Flagged for manual review'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Waiting indicator for next agent */}
            {loading && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed" style={{ borderColor: '#c96442', background: 'rgba(201,100,66,0.03)' }}>
                <div className="h-4 w-4 rounded-full border-2 border-[#c96442] border-t-transparent animate-spin" />
                <span className="text-sm animate-pulse" style={{ color: '#c96442' }}>
                  Next agent analyzing...
                </span>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="space-y-1.5">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                    <span className="shrink-0 mt-0.5">&#x26A0;&#xFE0F;</span>
                    <span className="text-amber-800 font-medium">{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======== RESULT ======== */}
        {result && result.error && (
          <Card className="border-[#b53333]/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="font-semibold text-[#b53333]">Error Processing Claim</p>
                  <p className="text-sm mt-1" style={{ color: '#b53333' }}>{String(result.error)}</p>
                  {result.details && <p className="text-xs mt-2 font-mono" style={{ color: '#5e5d59' }}>{String(result.details)}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {result && status && !result.error && (
          <div className="space-y-5 animate-in zoom-in-95 duration-500">
            {/* --- Decision Header --- */}
            <div className={`rounded-xl border-2 p-6 ${STATUS_BG[status] || "bg-[#f0eee6]"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{STATUS_ICON[status] || "📋"}</span>
                    <Badge className={`text-lg px-4 py-1.5 ${STATUS_BADGE[status] || ""}`}>{status}</Badge>
                  </div>
                  <p className="text-sm" style={{ color: '#5e5d59' }}>
                    Claim <button className="font-mono font-semibold hover:underline" style={{ color: '#141413' }} onClick={() => router.push(`/claims/${result.claim_id}`)}>{String(result.claim_id)}</button>
                    {decision?.processing_time_ms != null && <span> · Processed in {String(decision.processing_time_ms)}ms</span>}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm" style={{ color: '#5e5d59' }}>Claimed</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: '#141413' }}>₹{Number(result.claim_amount || 0).toLocaleString()}</div>
                  {decision?.approved_amount != null && Number(decision.approved_amount) > 0 && (
                    <div className="text-lg font-semibold text-emerald-700 mt-1">Approved: ₹{Number(decision.approved_amount).toLocaleString()}</div>
                  )}
                  {status === 'REJECTED' && (
                    <div className="text-lg font-semibold text-[#b53333] mt-1">Approved: ₹0</div>
                  )}
                </div>
              </div>
            </div>

            {/* --- "Why This Decision" Explainability --- */}
            {explanation && (
              <DecisionSummary explanation={explanation} status={status} />
            )}

            {/* --- Quick Stats --- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="pt-4 text-center">
                <div className="text-xs uppercase mb-1" style={{ color: '#5e5d59' }}>Confidence</div>
                <div className={`text-2xl font-bold ${Number(decision?.confidence_score) >= 0.9 ? "text-emerald-600" : Number(decision?.confidence_score) >= 0.7 ? "text-amber-700" : "text-[#b53333]"}`}>
                  {decision?.confidence_score ? `${(Number(decision.confidence_score) * 100).toFixed(0)}%` : "—"}
                </div>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <div className="text-xs uppercase mb-1" style={{ color: '#5e5d59' }}>Processing</div>
                <div className="text-2xl font-bold" style={{ color: '#141413' }}>{decision?.processing_time_ms ?? "—"}ms</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <div className="text-xs uppercase mb-1" style={{ color: '#5e5d59' }}>Agents Run</div>
                <div className="text-2xl font-bold" style={{ color: '#141413' }}>{pipeline.length}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4 text-center">
                <div className="text-xs uppercase mb-1" style={{ color: '#5e5d59' }}>Agents Passed</div>
                <div className="text-2xl font-bold text-emerald-600">{pipeline.filter(s => s.passed).length}/{pipeline.length}</div>
              </CardContent></Card>
            </div>

            {/* --- Confidence Breakdown + Amount Waterfall --- */}
            {explanation && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {explanation.confidence_breakdown && (
                  <Card><CardContent className="pt-6">
                    <ConfidenceBreakdownViz breakdown={explanation.confidence_breakdown} />
                  </CardContent></Card>
                )}
                {explanation.amount_waterfall?.length > 1 && (
                  <Card><CardContent className="pt-6">
                    <AmountWaterfall steps={explanation.amount_waterfall} />
                  </CardContent></Card>
                )}
              </div>
            )}

            {/* --- Line Item Breakdown --- */}
            {explanation?.line_items?.length > 0 && (
              <Card><CardContent className="pt-6">
                <LineItemBreakdown items={explanation.line_items} />
              </CardContent></Card>
            )}

            {/* --- Agent Pipeline Reasoning --- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: '#141413' }}>
                  Agent Reasoning Pipeline
                  <span className="text-sm font-normal" style={{ color: '#5e5d59' }}>({pipeline.length} agents)</span>
                </CardTitle>
                <p className="text-xs" style={{ color: '#5e5d59' }}>Each agent independently analyzed the claim. Click to expand reasoning.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {pipeline.map((step, i) => {
                  const meta = AGENT_META[step.step] || { icon: '⚙️', name: step.step, description: '' };
                  const rec = getAgentRecommendation(step);
                  const isExpanded = expandedAgents[step.step] ?? false;

                  return (
                    <div key={i} className="rounded-lg border overflow-hidden transition-all hover:shadow-sm" style={{ background: '#faf9f5', borderColor: '#e8e6dc' }}>
                      <button
                        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-[#f0eee6]/50 transition-colors"
                        onClick={() => toggleAgent(step.step)}
                      >
                        <span className="text-xl">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm" style={{ color: '#141413' }}>{meta.name}</span>
                            <span className="text-xs hidden sm:inline" style={{ color: '#5e5d59' }}>— {meta.description}</span>
                          </div>
                        </div>
                        <Badge className={`border text-xs font-bold ${rec.color}`}>{rec.label}</Badge>
                        <span className="text-xs" style={{ color: '#5e5d59' }}>{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded && (
                        <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: '#e8e6dc', background: '#f0eee6' }}>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#5e5d59' }}>Agent Reasoning</div>
                            <p className="text-sm leading-relaxed" style={{ color: '#4d4c48' }}>{step.details}</p>
                          </div>

                          {step.reasons.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#5e5d59' }}>Rejection Codes</div>
                              <div className="flex gap-1 flex-wrap">
                                {step.reasons.map((r, j) => <Badge key={j} variant="outline" className="text-xs font-mono">{r}</Badge>)}
                              </div>
                            </div>
                          )}

                          {step.adjustments && Object.keys(step.adjustments).length > 0 && (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#5e5d59' }}>Adjustments</div>
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(step.adjustments).map(([k, v]) => (
                                  <Badge key={k} variant="secondary" className="text-xs font-mono">
                                    {k}: {typeof v === 'number' ? `₹${v.toLocaleString()}` : JSON.stringify(v)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* --- Decision Notes --- */}
            {decision?.notes && (
              <Card className="border-blue-200 bg-blue-50"><CardContent className="pt-4">
                <p className="text-sm" style={{ color: '#4d4c48' }}>💡 <strong>Decision Notes:</strong> {String(decision.notes)}</p>
                {decision.next_steps && <p className="text-sm mt-1" style={{ color: '#5e5d59' }}>➡️ {String(decision.next_steps)}</p>}
              </CardContent></Card>
            )}

            {/* --- Counterfactuals --- */}
            {explanation?.counterfactuals?.length > 0 && (
              <Card><CardContent className="pt-6">
                <CounterfactualsList items={explanation.counterfactuals} />
              </CardContent></Card>
            )}

            {/* --- RAG Context --- */}
            {ragChunks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2" style={{ color: '#141413' }}>📚 RAG Knowledge Context <Badge variant="secondary">{ragChunks.length} chunks</Badge></CardTitle>
                  <p className="text-xs" style={{ color: '#5e5d59' }}>Policy knowledge and medical references used for AI decision-making</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ragChunks.map((chunk: { source: string; category: string; text: string; similarity: number }, i: number) => (
                    <div key={i} className="p-3 rounded-lg border text-sm" style={{ background: '#f0eee6', borderColor: '#e8e6dc' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{chunk.source}</Badge>
                        <Badge variant="secondary" className="text-xs">{chunk.category}</Badge>
                        <span className="text-xs ml-auto font-mono" style={{ color: '#5e5d59' }}>
                          {typeof chunk.similarity === 'number' ? `${(chunk.similarity * 100).toFixed(0)}% match` : ''}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: '#5e5d59' }}>{chunk.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* --- Policy References --- */}
            {explanation?.policy_references?.length > 0 && (
              <Card><CardContent className="pt-6">
                <PolicyReferences refs={explanation.policy_references} />
              </CardContent></Card>
            )}

            {/* --- View Full Details + Raw JSON (collapsible) --- */}
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => router.push(`/claims/${result.claim_id}`)}>
                View Full Claim Details →
              </Button>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer hover:text-[#141413] transition-colors py-2" style={{ color: '#5e5d59' }}>
                🔧 Raw JSON Response (technical)
              </summary>
              <pre className="p-4 rounded-lg text-xs overflow-auto max-h-60 mt-2" style={{ background: '#f0eee6', color: '#4d4c48' }}>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
