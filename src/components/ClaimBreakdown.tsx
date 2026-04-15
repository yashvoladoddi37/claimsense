"use client";

import { Badge } from "@/components/ui/badge";

// ---------- Types (mirrored from lib/types.ts for client use) ----------

interface LineItemDecision {
  description: string;
  category: string;
  claimed_amount: number;
  approved_amount: number;
  status: 'approved' | 'rejected' | 'reduced';
  reason?: string;
}

interface WaterfallStep {
  label: string;
  amount: number;
  type: 'start' | 'deduction' | 'addition' | 'total';
}

interface Counterfactual {
  condition: string;
  result: string;
  icon: string;
}

interface ConfidenceBreakdown {
  rule_engine: number;
  ai_medical: number;
  blended: number;
}

interface ExplanationData {
  summary: string;
  key_factors: string[];
  policy_references: string[];
  counterfactuals: Counterfactual[];
  confidence_breakdown: ConfidenceBreakdown;
  line_items: LineItemDecision[];
  amount_waterfall: WaterfallStep[];
}

// ---------- "Why This Decision" Card ----------

export function DecisionSummary({ explanation, status }: { explanation: ExplanationData; status: string }) {
  const bgMap: Record<string, string> = {
    APPROVED: "bg-[#27a644]/10 border-[#27a644]/30",
    REJECTED: "bg-[#b53333]/10 border-[#b53333]/30",
    PARTIAL: "bg-amber-600/10 border-amber-600/30",
    MANUAL_REVIEW: "bg-orange-500/10 border-orange-500/30",
  };
  const iconMap: Record<string, string> = {
    APPROVED: "✅", REJECTED: "❌", PARTIAL: "⚠️", MANUAL_REVIEW: "🔍",
  };

  return (
    <div className={`rounded-xl border-2 p-5 ${bgMap[status] || "bg-muted"}`}>
      <div className="flex items-start gap-3">
        <span className="text-3xl">{iconMap[status] || "📋"}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-[#87867f] mb-1">Why This Decision</h3>
          <p className="text-sm leading-relaxed text-[#4d4c48]">{explanation.summary}</p>
          {explanation.key_factors.length > 0 && (
            <div className="mt-3 space-y-1">
              {explanation.key_factors.map((f, i) => (
                <p key={i} className="text-xs text-[#87867f]">{f}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Confidence Breakdown Bar ----------

export function ConfidenceBreakdownViz({ breakdown }: { breakdown: ConfidenceBreakdown }) {
  const ruleW = Math.round(breakdown.rule_engine * 100);
  const aiW = Math.round(breakdown.ai_medical * 100);
  const blended = Math.round(breakdown.blended * 100);

  const barColor = blended >= 90 ? "bg-[#27a644]" : blended >= 70 ? "bg-amber-700" : "bg-[#b53333]";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#87867f] uppercase tracking-wider">Confidence Score</span>
        <span className={`text-lg font-bold ${blended >= 90 ? "text-[#27a644]" : blended >= 70 ? "text-amber-700" : "text-[#b53333]"}`}>
          {blended}%
        </span>
      </div>

      {/* Overall bar */}
      <div className="w-full bg-[#e8e6dc] rounded-full h-2.5">
        <div className={`${barColor} h-2.5 rounded-full transition-all duration-700`} style={{ width: `${blended}%` }} />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#87867f]">🔧 Rule Engine (60%)</span>
            <span className="font-mono font-semibold text-[#4d4c48]">{ruleW}%</span>
          </div>
          <div className="w-full bg-[#e8e6dc] rounded-full h-1.5">
            <div className="bg-[#c96442] h-1.5 rounded-full" style={{ width: `${ruleW}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#87867f]">🧠 AI Medical (40%)</span>
            <span className="font-mono font-semibold text-[#4d4c48]">{aiW}%</span>
          </div>
          <div className="w-full bg-[#e8e6dc] rounded-full h-1.5">
            <div className="bg-[#d97757] h-1.5 rounded-full" style={{ width: `${aiW}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Line Item Visual Diff ----------

export function LineItemBreakdown({ items }: { items: LineItemDecision[] }) {
  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.claimed_amount, 0);
  const approved = items.reduce((s, i) => s + i.approved_amount, 0);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-[#87867f] uppercase tracking-wider">Line Item Breakdown</h4>
      <div className="border border-[#e8e6dc] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f0eee6]">
              <th className="text-left p-3 font-medium text-xs uppercase text-[#5e5d59]">Item</th>
              <th className="text-left p-3 font-medium text-xs uppercase text-[#5e5d59]">Category</th>
              <th className="text-right p-3 font-medium text-xs uppercase text-[#5e5d59]">Claimed</th>
              <th className="text-right p-3 font-medium text-xs uppercase text-[#5e5d59]">Approved</th>
              <th className="text-center p-3 font-medium text-xs uppercase text-[#5e5d59]">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={`border-t border-[#e8e6dc] ${item.status === 'rejected' ? 'bg-[#b53333]/5' : item.status === 'reduced' ? 'bg-amber-600/5' : 'bg-[#faf9f5]'}`}>
                <td className="p-3">
                  <div className="font-medium text-[#4d4c48]">{item.description}</div>
                  {item.reason && <div className="text-xs text-[#b53333] mt-0.5">{item.reason}</div>}
                </td>
                <td className="p-3">
                  <Badge variant="secondary" className="text-xs bg-[#f0eee6] text-[#5e5d59] border-[#e8e6dc]">{item.category}</Badge>
                </td>
                <td className="p-3 text-right font-mono text-[#4d4c48]">₹{item.claimed_amount.toLocaleString()}</td>
                <td className="p-3 text-right font-mono font-semibold">
                  {item.status === 'rejected' ? (
                    <span className="text-[#b53333] line-through">₹0</span>
                  ) : (
                    <span className="text-[#27a644]">₹{item.approved_amount.toLocaleString()}</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {item.status === 'approved' && <span className="text-[#27a644] font-bold">✅</span>}
                  {item.status === 'rejected' && <span className="text-[#b53333] font-bold">❌</span>}
                  {item.status === 'reduced' && <span className="text-amber-700 font-bold">⚠️</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#e8e6dc] bg-[#f0eee6]">
              <td colSpan={2} className="p-3 font-semibold text-[#4d4c48]">Total</td>
              <td className="p-3 text-right font-mono font-semibold text-[#4d4c48]">₹{total.toLocaleString()}</td>
              <td className="p-3 text-right font-mono font-bold text-[#27a644]">₹{approved.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------- Amount Waterfall ----------

export function AmountWaterfall({ steps }: { steps: WaterfallStep[] }) {
  if (steps.length <= 1) return null;

  const maxAmount = Math.max(...steps.map(s => Math.abs(s.amount)));

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-[#87867f] uppercase tracking-wider">Amount Breakdown</h4>
      <div className="space-y-2">
        {steps.map((step, i) => {
          const pct = maxAmount > 0 ? Math.abs(step.amount) / maxAmount * 100 : 0;
          const isDeduction = step.type === 'deduction';
          const isTotal = step.type === 'total';

          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 text-xs text-right text-[#87867f] shrink-0">{step.label}</div>
              <div className="flex-1 h-7 bg-[#f0eee6] rounded-md overflow-hidden relative">
                <div
                  className={`h-full rounded-md transition-all duration-500 ${
                    isTotal ? 'bg-[#27a644]' : isDeduction ? 'bg-[#b53333]' : 'bg-[#c96442]'
                  }`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                <span className={`absolute inset-y-0 flex items-center text-xs font-bold px-2 ${pct > 30 ? 'text-white' : 'text-[#4d4c48]'}`}
                  style={{ left: pct > 30 ? '4px' : `${pct + 2}%` }}>
                  {isDeduction ? '-' : ''}₹{Math.abs(step.amount).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Counterfactuals ("What If") ----------

export function CounterfactualsList({ items }: { items: Counterfactual[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-[#87867f] uppercase tracking-wider">💡 What Could Change This Decision</h4>
      <div className="space-y-2">
        {items.map((cf, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#c96442]/8 border border-[#c96442]/20">
            <span className="text-lg">{cf.icon}</span>
            <div>
              <p className="text-sm font-medium text-[#4d4c48]">{cf.condition}</p>
              <p className="text-xs text-[#87867f] mt-0.5">→ {cf.result}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Policy References ----------

export function PolicyReferences({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[#87867f] uppercase tracking-wider">📜 Policy Sections Evaluated</h4>
      <div className="flex flex-wrap gap-1.5">
        {refs.map((ref, i) => (
          <Badge key={i} variant="outline" className="text-xs font-normal bg-[#c96442]/10 border-[#c96442]/30 text-[#c96442]">
            {ref}
          </Badge>
        ))}
      </div>
    </div>
  );
}
