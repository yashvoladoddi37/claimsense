"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DecisionSummary,
  ConfidenceBreakdownViz,
  LineItemBreakdown,
  AmountWaterfall,
  CounterfactualsList,
  PolicyReferences,
} from "@/components/ClaimBreakdown";

interface StepResult { step: string; passed: boolean; decision_impact: string; reasons: string[]; details: string; adjustments?: Record<string, unknown>; }
interface RagChunk { source: string; category: string; text: string; similarity: number; }
interface AgentOverride { step: string; original_recommendation: string; reviewer_action: 'ACCEPT' | 'OVERRIDE'; override_decision?: string; reviewer_comment?: string; }

// Agent metadata
const AGENT_META: Record<string, { icon: string; name: string; description: string }> = {
  'Eligibility Check': { icon: '🛡️', name: 'Eligibility Agent', description: 'Verifies policy status, waiting periods, and member coverage' },
  'Document Validation': { icon: '📄', name: 'Document Agent', description: 'Validates prescriptions, bills, and supporting documents' },
  'Coverage Check': { icon: '📋', name: 'Coverage Agent', description: 'Checks service coverage, exclusions, and pre-authorization' },
  'Limits Check': { icon: '💰', name: 'Limits Agent', description: 'Applies annual limits, sub-limits, co-pay, and deductions' },
  'Fraud Detection': { icon: '🔍', name: 'Fraud Detection Agent', description: 'Screens for duplicate claims, unusual patterns, and anomalies' },
  'AI Medical Review': { icon: '🧠', name: 'Medical Review Agent', description: 'AI-powered assessment of medical necessity using RAG context' },
};

const STATUS_BG: Record<string, string> = {
  APPROVED: "bg-[#27a644]/10 border-[#27a644]/30", REJECTED: "bg-[#b53333]/10 border-[#b53333]/30",
  PARTIAL: "bg-amber-600/10 border-amber-600/30", MANUAL_REVIEW: "bg-orange-500/10 border-orange-500/30",
  APPEALED: "bg-purple-500/10 border-purple-500/30",
};
const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-[#27a644]/15 text-[#27a644]", REJECTED: "bg-[#b53333]/10 text-[#b53333]",
  PARTIAL: "bg-amber-600/10 text-amber-700", MANUAL_REVIEW: "bg-orange-500/10 text-orange-700",
  APPEALED: "bg-purple-500/10 text-purple-700",
};

function getAgentRecommendation(step: StepResult): { label: string; color: string } {
  if (step.passed) return { label: 'PAY', color: 'bg-[#27a644]/15 text-[#27a644] border-[#27a644]/30' };
  if (step.decision_impact === 'REJECT') return { label: 'DENY', color: 'bg-[#b53333]/10 text-[#b53333] border-[#b53333]/30' };
  if (step.decision_impact === 'PARTIAL') return { label: 'PARTIAL', color: 'bg-amber-600/10 text-amber-700 border-amber-600/30' };
  return { label: 'REVIEW', color: 'bg-orange-500/10 text-orange-700 border-orange-500/30' };
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[#f0eee6] rounded ${className}`} />;
}


export default function ClaimDetail() {
  const { id } = useParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [claim, setClaim] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  // Review state
  const [agentOverrides, setAgentOverrides] = useState<Record<string, AgentOverride>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [finalDecision, setFinalDecision] = useState<string>("");
  const [overrideAmount, setOverrideAmount] = useState<string>("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

  // Appeal state
  const [appealReason, setAppealReason] = useState("");
  const [appealCategory, setAppealCategory] = useState("documentation");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealMsg, setAppealMsg] = useState("");

  const fetchClaim = useCallback(() => {
    fetch(`/api/claims/${id}`)
      .then((r) => r.json())
      .then((data) => { setClaim(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchClaim(); }, [fetchClaim]);

  function toggleAgent(step: string) {
    setExpandedAgents(prev => ({ ...prev, [step]: !prev[step] }));
  }

  function setOverride(step: string, action: 'ACCEPT' | 'OVERRIDE', originalRec: string) {
    setAgentOverrides(prev => ({
      ...prev,
      [step]: { step, original_recommendation: originalRec, reviewer_action: action, override_decision: action === 'OVERRIDE' ? 'OVERRIDDEN' : undefined },
    }));
  }

  async function submitReview() {
    if (!finalDecision || !reviewNotes || !reviewerName) return;
    setReviewSubmitting(true);
    const res = await fetch(`/api/claims/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        final_decision: finalDecision,
        approved_amount: overrideAmount ? parseFloat(overrideAmount) : undefined,
        reviewer_notes: reviewNotes,
        reviewed_by: reviewerName,
        agent_overrides: Object.values(agentOverrides),
      }),
    });
    const data = await res.json();
    setReviewMsg(data.message || data.error);
    setReviewSubmitting(false);
    if (res.ok) fetchClaim();
  }

  async function submitAppeal() {
    setAppealSubmitting(true);
    const res = await fetch(`/api/claims/${id}/appeal`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: `[${appealCategory.toUpperCase()}] ${appealReason}` }),
    });
    const data = await res.json();
    setAppealMsg(data.message || data.error);
    setAppealSubmitting(false);
    if (res.ok) setClaim(prev => prev ? { ...prev, status: "APPEALED", appeal_status: "PENDING" } : null);
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4 py-8">
      <Skeleton className="h-10 w-64" /><Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
  if (!claim || claim.error) return (
    <div className="text-center py-16"><div className="text-4xl mb-3">🔍</div>
      <p className="text-lg font-medium text-[#141413]">Claim not found</p>
      <Link href="/"><Button variant="outline" className="mt-4 border-[#e8e6dc] text-[#5e5d59] hover:bg-[#f0eee6]">← Back to Dashboard</Button></Link>
    </div>
  );

  const pipeline: StepResult[] = (claim.pipeline_result as StepResult[]) || [];
  const extraction = claim.extraction as Record<string, unknown> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const explanation = extraction?.explanation as any;
  const aiContext = extraction?.medicalReview || (claim.input_data as Record<string, unknown>)?.ai_context;
  const ragChunks: RagChunk[] = (extraction?.ragContext as { chunk: RagChunk; similarity: number }[])?.map(
    r => ({ ...r.chunk, similarity: r.similarity })
  ) || (aiContext as Record<string, unknown>)?.rag_chunks_used as RagChunk[] || [];
  const status = String(claim.status);
  const isReviewed = !!claim.reviewed_at;
  const needsReview = status === 'MANUAL_REVIEW' && !isReviewed;
  const canAppeal = (status === 'REJECTED' || status === 'PARTIAL') && claim.appeal_status !== 'PENDING';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/" className="text-sm text-[#87867f] hover:text-[#141413] transition-colors">← Dashboard</Link>

      {/* Header */}
      <div className={`rounded-xl border-2 p-4 sm:p-6 ${STATUS_BG[status] || "bg-[#f0eee6]"}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold font-mono text-[#141413]">{String(claim.id)}</h1>
              <Badge className={`text-sm sm:text-base px-2 sm:px-3 py-1 ${STATUS_BADGE[status] || ""}`}>{status}</Badge>
              {isReviewed && <Badge className="bg-[#c96442]/10 text-[#c96442] border-[#c96442]/30 text-xs">Reviewed</Badge>}
              {claim.appeal_status === 'PENDING' && <Badge className="bg-purple-500/10 text-purple-700 text-xs">Appeal Pending</Badge>}
            </div>
            <p className="text-sm sm:text-base text-[#5e5d59]">{String(claim.member_name)} ({String(claim.member_id)}) · {String(claim.treatment_date)}</p>
            {claim.hospital && <p className="text-sm text-[#5e5d59] mt-1">{String(claim.hospital)}</p>}
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-[#5e5d59]">Claimed</div>
            <div className="text-xl sm:text-2xl font-semibold text-[#141413]">₹{Number(claim.claim_amount).toLocaleString()}</div>
            {Number(claim.approved_amount) > 0 && (
              <div className="text-lg font-semibold text-[#27a644] mt-1">Approved: ₹{Number(claim.approved_amount).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>

      {/* ======== EXPLAINABILITY: "Why This Decision" ======== */}
      {explanation && (
        <DecisionSummary
          explanation={explanation}
          status={status}
        />
      )}

      {/* Metrics bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#faf9f5] border-[#e8e6dc]"><CardContent className="pt-4 text-center">
          <div className="text-xs text-[#87867f] uppercase mb-1">Confidence</div>
          <div className={`text-2xl font-semibold ${Number(claim.confidence_score) >= 0.9 ? "text-[#27a644]" : Number(claim.confidence_score) >= 0.7 ? "text-amber-600" : "text-[#b53333]"}`}>
            {claim.confidence_score ? `${(Number(claim.confidence_score) * 100).toFixed(0)}%` : "—"}</div>
        </CardContent></Card>
        <Card className="bg-[#faf9f5] border-[#e8e6dc]"><CardContent className="pt-4 text-center">
          <div className="text-xs text-[#87867f] uppercase mb-1">Processing Time</div>
          <div className="text-2xl font-semibold text-[#141413]">{String(claim.processing_time_ms)}ms</div>
        </CardContent></Card>
        <Card className="bg-[#faf9f5] border-[#e8e6dc]"><CardContent className="pt-4 text-center">
          <div className="text-xs text-[#87867f] uppercase mb-1">Agents Run</div>
          <div className="text-2xl font-semibold text-[#141413]">{pipeline.length}</div>
        </CardContent></Card>
        <Card className="bg-[#faf9f5] border-[#e8e6dc]"><CardContent className="pt-4 text-center">
          <div className="text-xs text-[#87867f] uppercase mb-1">Agents Passed</div>
          <div className="text-2xl font-semibold text-[#27a644]">{pipeline.filter(s => s.passed).length}/{pipeline.length}</div>
        </CardContent></Card>
      </div>

      {/* ======== EXPLAINABILITY: Confidence Breakdown + Line Items (side by side) ======== */}
      {explanation && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-[#faf9f5] border-[#e8e6dc]">
            <CardContent className="pt-6">
              <ConfidenceBreakdownViz
                breakdown={explanation.confidence_breakdown}
              />
            </CardContent>
          </Card>
          <Card className="bg-[#faf9f5] border-[#e8e6dc]">
            <CardContent className="pt-6">
              <AmountWaterfall
                steps={explanation.amount_waterfall}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ======== EXPLAINABILITY: Line Item Visual Diff ======== */}
      {explanation && explanation.line_items?.length > 0 && (
        <Card className="bg-[#faf9f5] border-[#e8e6dc]">
          <CardContent className="pt-6">
            <LineItemBreakdown
              items={explanation.line_items}
            />
          </CardContent>
        </Card>
      )}

      {/* ======== EXPLAINABILITY: Counterfactuals ("What If") ======== */}
      {explanation && explanation.counterfactuals?.length > 0 && (
        <Card className="bg-[#faf9f5] border-[#e8e6dc]">
          <CardContent className="pt-6">
            <CounterfactualsList
              items={explanation.counterfactuals}
            />
          </CardContent>
        </Card>
      )}

      {/* ======== EXPLAINABILITY: Policy References ======== */}
      {explanation && (
        <Card className="bg-[#faf9f5] border-[#e8e6dc]">
          <CardContent className="pt-6">
            <PolicyReferences
              refs={explanation.policy_references}
            />
          </CardContent>
        </Card>
      )}

      {/* Decision Notes */}
      {claim.decision_notes && (
        <Card className="border-[#c96442]/30 bg-[#c96442]/5"><CardContent className="pt-4">
          <p className="text-sm text-[#4d4c48]">💡 <strong className="text-[#141413]">Decision Notes:</strong> {String(claim.decision_notes)}</p>
        </CardContent></Card>
      )}

      {/* Reviewer info if already reviewed */}
      {isReviewed && (
        <Card className="border-[#c96442]/30 bg-[#faf9f5]">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-[#141413]">✅ Human Review Completed</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm text-[#4d4c48]">
            <p><strong className="text-[#141413]">Reviewed by:</strong> {String(claim.reviewed_by)} · <span className="text-[#87867f]">{new Date(String(claim.reviewed_at)).toLocaleString()}</span></p>
            <p><strong className="text-[#141413]">Final Decision:</strong> <Badge className={STATUS_BADGE[String(claim.reviewer_decision)] || ""}>{String(claim.reviewer_decision)}</Badge></p>
            {claim.reviewer_notes && <p><strong className="text-[#141413]">Reviewer Notes:</strong> {String(claim.reviewer_notes)}</p>}
          </CardContent>
        </Card>
      )}

      {/* ======== AGENTIC AI PIPELINE ======== */}
      <Card className="bg-[#faf9f5] border-[#e8e6dc]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#141413]">
            Agentic AI Pipeline
            <span className="text-sm font-normal text-[#87867f]">
              ({pipeline.length} specialized agents)
            </span>
            {needsReview && <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/30 ml-auto">Awaiting Human Review</Badge>}
          </CardTitle>
          <p className="text-xs text-[#87867f]">Each agent independently analyzes the claim and provides a recommendation. Click an agent to expand its reasoning.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {pipeline.map((step, i) => {
            const meta = AGENT_META[step.step] || { icon: '⚙️', name: step.step, description: '' };
            const rec = getAgentRecommendation(step);
            const isExpanded = expandedAgents[step.step] ?? false;
            const override = agentOverrides[step.step];
            const existingOverrides = (claim.reviewer_overrides as AgentOverride[]) || [];
            const savedOverride = existingOverrides.find((o: AgentOverride) => o.step === step.step);

            return (
              <div key={i} className="rounded-lg border border-[#e8e6dc] bg-[#faf9f5] overflow-hidden transition-all hover:shadow-sm">
                {/* Agent Header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#f0eee6]/50 transition-colors"
                  onClick={() => toggleAgent(step.step)}
                >
                  <span className="text-2xl">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#141413]">{meta.name}</span>
                      <span className="text-xs text-[#87867f] hidden sm:inline">— {meta.description}</span>
                    </div>
                  </div>
                  <Badge className={`border text-xs font-semibold ${rec.color}`}>{rec.label}</Badge>
                  {savedOverride && (
                    <Badge className="bg-[#c96442]/10 text-[#c96442] border-[#c96442]/30 text-xs">
                      {savedOverride.reviewer_action === 'ACCEPT' ? '✓ Accepted' : '↻ Overridden'}
                    </Badge>
                  )}
                  <span className="text-[#87867f] text-xs">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* Expanded Agent Details */}
                {isExpanded && (
                  <div className="border-t border-[#e8e6dc] px-4 pb-4 pt-3 space-y-3 bg-[#f0eee6]/30">
                    {/* Reasoning */}
                    <div>
                      <div className="text-xs font-semibold text-[#87867f] uppercase tracking-wider mb-1">Agent Reasoning</div>
                      <p className="text-sm leading-relaxed text-[#4d4c48]">{step.details}</p>
                    </div>

                    {/* Rejection reasons */}
                    {step.reasons.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-[#87867f] uppercase tracking-wider mb-1">Rejection Codes</div>
                        <div className="flex gap-1 flex-wrap">
                          {step.reasons.map((r, j) => <Badge key={j} variant="outline" className="text-xs font-mono border-[#e8e6dc] text-[#5e5d59]">{r}</Badge>)}
                        </div>
                      </div>
                    )}

                    {/* Adjustments */}
                    {step.adjustments && Object.keys(step.adjustments).length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-[#87867f] uppercase tracking-wider mb-1">Adjustments</div>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(step.adjustments).map(([k, v]) => (
                            <Badge key={k} variant="secondary" className="text-xs font-mono bg-[#f0eee6] text-[#5e5d59]">
                              {k}: {typeof v === 'number' ? `₹${v.toLocaleString()}` : JSON.stringify(v)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reviewer controls for MANUAL_REVIEW claims */}
                    {needsReview && (
                      <div className="border-t border-[#e8e6dc] pt-3 mt-3">
                        <div className="text-xs font-semibold text-[#87867f] uppercase tracking-wider mb-2">Reviewer Action</div>
                        <div className="flex gap-2 items-center">
                          <Button variant={override?.reviewer_action === 'ACCEPT' ? 'default' : 'outline'} className="text-xs h-8"
                            onClick={() => setOverride(step.step, 'ACCEPT', rec.label)}>✓ Accept</Button>
                          <Button variant={override?.reviewer_action === 'OVERRIDE' ? 'default' : 'outline'} className="text-xs h-8"
                            onClick={() => setOverride(step.step, 'OVERRIDE', rec.label)}>↻ Override</Button>
                          {override && (
                            <span className="text-xs text-[#87867f] ml-2">
                              {override.reviewer_action === 'ACCEPT' ? 'Accepted agent recommendation' : 'Overriding agent recommendation'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Saved override */}
                    {savedOverride && (
                      <div className="border-t border-[#e8e6dc] pt-3 mt-3 text-sm text-[#4d4c48]">
                        <span className="font-semibold text-[#141413]">Reviewer:</span> {savedOverride.reviewer_action === 'ACCEPT' ? 'Accepted' : 'Overrode'} this agent&apos;s {savedOverride.original_recommendation} recommendation
                        {savedOverride.reviewer_comment && <span className="text-[#87867f]"> — &quot;{savedOverride.reviewer_comment}&quot;</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ======== RAG CONTEXT ======== */}
      {ragChunks.length > 0 && (
        <Card className="bg-[#faf9f5] border-[#e8e6dc]">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-[#141413]">📚 RAG Knowledge Context <Badge variant="secondary" className="bg-[#f0eee6] text-[#5e5d59]">{ragChunks.length} chunks retrieved</Badge></CardTitle>
            <p className="text-xs text-[#87867f]">Policy knowledge and medical references used for AI decision-making</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {ragChunks.map((chunk, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#f0eee6]/50 border border-[#e8e6dc] text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs border-[#e8e6dc] text-[#5e5d59]">{chunk.source}</Badge>
                  <Badge variant="secondary" className="text-xs bg-[#f0eee6] text-[#5e5d59]">{chunk.category}</Badge>
                  <span className="text-xs text-[#87867f] ml-auto font-mono">
                    {typeof chunk.similarity === 'number' ? `${(chunk.similarity * 100).toFixed(0)}% match` : ''}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-[#87867f]">{chunk.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ======== MANUAL REVIEW FORM ======== */}
      {needsReview && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#141413]">👨‍⚕️ Human-in-the-Loop Review</CardTitle>
            <p className="text-xs text-[#87867f]">Review the AI agents&apos; recommendations and make a final decision</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[#87867f] block mb-1">Final Decision</label>
                <select className="w-full border border-[#e8e6dc] rounded px-3 py-2 text-sm bg-[#faf9f5] text-[#141413]" value={finalDecision} onChange={e => setFinalDecision(e.target.value)}>
                  <option value="">Select...</option>
                  <option value="APPROVED">✅ Approve</option>
                  <option value="REJECTED">❌ Reject</option>
                  <option value="PARTIAL">⚠️ Partial Approve</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#87867f] block mb-1">Override Amount (optional)</label>
                <input type="number" className="w-full border border-[#e8e6dc] rounded px-3 py-2 text-sm bg-[#faf9f5] text-[#141413]" placeholder="Leave empty to use engine amount"
                  value={overrideAmount} onChange={e => setOverrideAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#87867f] block mb-1">Reviewer Name</label>
              <input className="w-full border border-[#e8e6dc] rounded px-3 py-2 text-sm bg-[#faf9f5] text-[#141413]" value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#87867f] block mb-1">Review Notes</label>
              <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Explain your decision..." rows={3} />
            </div>
            <Button onClick={submitReview} disabled={reviewSubmitting || !finalDecision || !reviewNotes || !reviewerName} className="w-full bg-[#c96442] hover:bg-[#d97757] text-white">
              {reviewSubmitting ? "Submitting..." : "Submit Review Decision"}
            </Button>
            {reviewMsg && <p className="text-sm text-center text-[#87867f]">{reviewMsg}</p>}
          </CardContent>
        </Card>
      )}

      {/* ======== APPEAL FORM ======== */}
      {canAppeal && (
        <Card className="border-purple-500/30 bg-[#faf9f5]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#141413]">📋 Appeal This Decision</CardTitle>
            <p className="text-xs text-[#87867f]">If you believe this decision is incorrect, submit an appeal with supporting information</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#87867f] block mb-1">Appeal Category</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  { value: 'documentation', label: '📄 Documentation Issue', desc: 'Missing or insufficient docs' },
                  { value: 'coverage', label: '📋 Coverage Dispute', desc: 'Believe treatment is covered' },
                  { value: 'amount', label: '💰 Amount Dispute', desc: 'Approved amount incorrect' },
                  { value: 'other', label: '❓ Other', desc: 'Other reason' },
                ].map(opt => (
                  <button key={opt.value}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      appealCategory === opt.value ? 'border-purple-400 bg-purple-500/10 ring-1 ring-purple-400' : 'border-[#e8e6dc] hover:border-[#87867f]'
                    }`}
                    onClick={() => setAppealCategory(opt.value)}
                  >
                    <div className="font-medium text-[#141413]">{opt.label}</div>
                    <div className="text-[#87867f] mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#87867f] block mb-1">Appeal Reason (min 10 chars)</label>
              <Textarea value={appealReason} onChange={e => setAppealReason(e.target.value)}
                placeholder="Explain why you believe this decision should be reconsidered..." rows={3} />
            </div>
            <Button variant="outline" onClick={submitAppeal}
              disabled={appealSubmitting || appealReason.trim().length < 10}
              className="w-full border-purple-500/30 hover:bg-purple-500/5 text-[#141413]">
              {appealSubmitting ? "Submitting..." : "Submit Appeal"}
            </Button>
            {appealMsg && <p className="text-sm text-center text-[#87867f]">{appealMsg}</p>}
          </CardContent>
        </Card>
      )}

      {/* Appeal Status */}
      {claim.appeal_status === 'PENDING' && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📋</div>
              <div>
                <p className="font-medium text-sm text-[#141413]">Appeal Pending</p>
                <p className="text-xs text-[#87867f]">{claim.appeal_reason ? `Reason: ${String(claim.appeal_reason)}` : 'Your appeal is being reviewed.'}</p>
                <p className="text-xs text-[#87867f] mt-1">A human reviewer will assess your appeal within 48 hours.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Input Data (collapsible) */}
      <details className="text-sm">
        <summary className="cursor-pointer text-[#87867f] hover:text-[#141413] transition-colors py-2">
          🔧 Raw Claim Data (debug)
        </summary>
        <pre className="bg-[#f0eee6] p-4 rounded-lg text-xs overflow-auto max-h-60 mt-2 text-[#4d4c48]">
          {JSON.stringify({ input: claim.input_data, extraction: claim.extraction }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
