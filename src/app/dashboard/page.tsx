"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Claim { [key: string]: any; }

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-[#27a644]/15 text-[#27a644] border-[#27a644]/30",
  REJECTED: "bg-[#b53333]/10 text-[#b53333] border-[#b53333]/30",
  PARTIAL: "bg-amber-600/10 text-amber-700 border-amber-600/30",
  MANUAL_REVIEW: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  PROCESSING: "bg-[#c96442]/10 text-[#c96442] border-[#c96442]/30",
  APPEALED: "bg-purple-500/10 text-purple-700 border-purple-500/30",
};

const STATUS_ICONS: Record<string, string> = {
  APPROVED: "✅", REJECTED: "❌", PARTIAL: "⚠️",
  MANUAL_REVIEW: "🔍", PROCESSING: "⏳", APPEALED: "📋",
};

// Rejection reason labels for the chart
const REASON_LABELS: Record<string, string> = {
  WAITING_PERIOD: "Waiting Period",
  SERVICE_NOT_COVERED: "Not Covered",
  EXCLUDED_CONDITION: "Exclusion",
  PRE_AUTH_MISSING: "No Pre-Auth",
  MISSING_DOCUMENTS: "Missing Docs",
  PER_CLAIM_EXCEEDED: "Over Limit",
  ANNUAL_LIMIT_EXCEEDED: "Annual Limit",
  SUB_LIMIT_EXCEEDED: "Sub-Limit",
  DUPLICATE_CLAIM: "Duplicate",
  NOT_MEDICALLY_NECESSARY: "Not Necessary",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[#f0eee6] rounded ${className}`} />;
}

export default function Dashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/claims")
      .then((r) => r.json())
      .then((data) => { setClaims(data.claims || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const stats = {
    total: claims.length,
    approved: claims.filter((c) => c.status === "APPROVED").length,
    rejected: claims.filter((c) => c.status === "REJECTED").length,
    partial: claims.filter((c) => c.status === "PARTIAL").length,
    manual: claims.filter((c) => c.status === "MANUAL_REVIEW").length,
    appealed: claims.filter((c) => c.status === "APPEALED").length,
    totalAmount: claims.reduce((s, c) => s + (c.claim_amount || 0), 0),
    approvedAmount: claims.reduce((s, c) => s + (c.approved_amount || 0), 0),
    avgConfidence: claims.length > 0 ? claims.reduce((s, c) => s + (c.confidence_score || 0), 0) / claims.length : 0,
    avgProcessingTime: claims.length > 0 ? Math.round(claims.reduce((s, c) => s + (c.processing_time_ms || 0), 0) / claims.length) : 0,
  };

  // Rejection reason frequency
  const rejectionReasons: Record<string, number> = {};
  claims.forEach(c => {
    if (c.decision_reasons_json) {
      try {
        const reasons = JSON.parse(c.decision_reasons_json);
        if (Array.isArray(reasons)) {
          reasons.forEach((r: string) => { rejectionReasons[r] = (rejectionReasons[r] || 0) + 1; });
        }
      } catch { /* */ }
    }
  });
  const sortedReasons = Object.entries(rejectionReasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const maxReasonCount = sortedReasons.length > 0 ? sortedReasons[0][1] : 1;

  const approvalRate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(0) : "—";

  const filteredClaims = statusFilter === "all" ? claims : claims.filter(c => c.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[32px] font-medium tracking-[-0.5px] text-[#141413]">Claims Dashboard</h1>
          <p className="text-[#87867f] text-sm sm:text-[15px] mt-1">AI-powered OPD claim adjudication with RAG-enhanced medical review</p>
        </div>
        <div className="flex gap-2">
          <Link href="/policy"><Button variant="outline" className="border-[#e8e6dc] text-[#4d4c48] hover:bg-[#f0eee6] text-xs sm:text-sm">Policy Explorer</Button></Link>
          <Link href="/submit"><Button className="bg-[#c96442] hover:bg-[#d97757] text-[#faf9f5] text-xs sm:text-sm">+ New Claim</Button></Link>
        </div>
      </div>

      {/* Stats Cards — Row 1 */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] border-l-4 border-l-[#c96442]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Total Claims</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-[#141413]">{stats.total}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] border-l-4 border-l-[#27a644]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Approved</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-[#27a644]">{stats.approved}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] border-l-4 border-l-[#b53333]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Rejected</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-[#b53333]">{stats.rejected}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] border-l-4 border-l-[#d97757]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Partial</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-amber-700">{stats.partial}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] border-l-4 border-l-orange-500"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Manual Review</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-orange-700">{stats.manual}</div></CardContent></Card>
          </div>

          {/* Stats Cards — Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Total Claimed</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold text-[#141413]">₹{stats.totalAmount.toLocaleString()}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Total Approved</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold text-[#27a644]">₹{stats.approvedAmount.toLocaleString()}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Avg Confidence</CardTitle></CardHeader>
              <CardContent><div className={`text-xl font-semibold ${stats.avgConfidence >= 0.9 ? "text-[#27a644]" : stats.avgConfidence >= 0.7 ? "text-amber-700" : "text-[#b53333]"}`}>
                {stats.total > 0 ? `${(stats.avgConfidence * 100).toFixed(0)}%` : "—"}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]"><CardHeader className="pb-1"><CardTitle className="text-xs text-[#87867f] uppercase tracking-wider">Approval Rate</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-semibold text-[#141413]">{approvalRate}%</div>
                <div className="w-full bg-[#f0eee6] rounded-full h-1.5 mt-2">
                  <div className="bg-[#27a644] h-1.5 rounded-full" style={{ width: `${stats.total > 0 ? (stats.approved / stats.total) * 100 : 0}%` }} />
                </div>
              </CardContent></Card>
          </div>
        </>
      )}

      {/* Rejection Reasons Chart + Quick Actions */}
      {!loading && stats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rejection Reasons */}
          {sortedReasons.length > 0 && (
            <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-[#4d4c48]">Common Rejection Reasons</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {sortedReasons.map(([reason, count]) => (
                  <div key={reason} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-[#87867f] text-right truncate">{REASON_LABELS[reason] || reason}</div>
                    <div className="flex-1 h-5 bg-[#f0eee6] rounded overflow-hidden">
                      <div className="h-full bg-[#b53333]/40 rounded transition-all" style={{ width: `${(count / maxReasonCount) * 100}%` }} />
                    </div>
                    <div className="w-6 text-xs font-mono font-semibold text-right text-[#4d4c48]">{count}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Status Distribution */}
          <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#4d4c48]">Decision Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-40 mb-2 px-2">
                {(() => {
                  const items = [
                    { key: 'APPROVED', count: stats.approved, color: 'bg-[#27a644]', label: 'Approved' },
                    { key: 'PARTIAL', count: stats.partial, color: 'bg-[#d97757]', label: 'Partial' },
                    { key: 'REJECTED', count: stats.rejected, color: 'bg-[#b53333]', label: 'Rejected' },
                    { key: 'MANUAL_REVIEW', count: stats.manual, color: 'bg-orange-500', label: 'Review' },
                    { key: 'APPEALED', count: stats.appealed, color: 'bg-purple-500', label: 'Appealed' },
                  ];
                  const maxCount = Math.max(...items.map(i => i.count), 1);
                  return items.map(item => {
                    const pct = (item.count / maxCount) * 100;
                    return (
                      <div key={item.key} className="flex-1 flex flex-col items-center justify-end h-full">
                        <span className="text-sm font-semibold text-[#4d4c48] mb-1">{item.count}</span>
                        <div className={`w-full ${item.color} rounded-t-md`} style={{ height: `${Math.max(pct, 6)}%` }} />
                        <span className="text-xs text-[#87867f] mt-2">{item.label}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Claims Table */}
      <Card className="bg-[#faf9f5] border border-[#f0eee6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-[#141413]">Recent Claims</CardTitle>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              {["all", "APPROVED", "REJECTED", "PARTIAL", "MANUAL_REVIEW", "APPEALED"].map(s => (
                <Button key={s} variant={statusFilter === s ? "default" : "ghost"}
                  className={`text-xs h-7 px-2 ${statusFilter === s ? "bg-[#e8e6dc] text-[#141413] hover:bg-[#e8e6dc]" : "text-[#87867f] hover:text-[#5e5d59] hover:bg-transparent"}`}
                  onClick={() => setStatusFilter(s)}>
                  {s === "all" ? "All" : `${STATUS_ICONS[s] || ""} ${s === "MANUAL_REVIEW" ? "Review" : s.charAt(0) + s.slice(1).toLowerCase()}`}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : filteredClaims.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-[#87867f] mb-1">{statusFilter === "all" ? "No claims submitted yet" : `No ${statusFilter} claims`}</p>
              <p className="text-sm text-[#87867f] mb-4">Submit a claim or run test cases to get started</p>
              <div className="flex gap-2 justify-center">
                <Link href="/submit"><Button className="bg-[#c96442] hover:bg-[#d97757] text-[#faf9f5]">Submit Claim</Button></Link>
                <Link href="/test-runner"><Button variant="outline" className="border-[#e8e6dc] text-[#4d4c48] hover:bg-[#f0eee6]">Run Tests</Button></Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#f0eee6]">
                    <TableHead className="w-32 text-[#87867f]">Claim ID</TableHead>
                    <TableHead className="text-[#87867f]">Member</TableHead>
                    <TableHead className="text-right text-[#87867f]">Claimed</TableHead>
                    <TableHead className="text-right text-[#87867f]">Approved</TableHead>
                    <TableHead className="text-[#87867f]">Status</TableHead>
                    <TableHead className="text-right text-[#87867f] hidden md:table-cell">Confidence</TableHead>
                    <TableHead className="text-[#87867f] hidden md:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.map((claim) => (
                    <TableRow key={claim.id} className="cursor-pointer group hover:bg-[#f0eee6]/50 transition-colors border-[#f0eee6]">
                      <TableCell>
                        <Link href={`/claims/${claim.id}`} className="font-mono text-sm text-[#c96442] hover:text-[#d97757] hover:underline">
                          {claim.id}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium text-[#141413]">{claim.member_name}</TableCell>
                      <TableCell className="text-right font-mono text-[#4d4c48]">₹{claim.claim_amount?.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {claim.status === "REJECTED" ? <span className="text-[#b0aea5]">—</span> : <span className="text-[#27a644]">{`₹${(claim.approved_amount || 0).toLocaleString()}`}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[claim.status] || ""} border`}>
                          {STATUS_ICONS[claim.status] || ""} {claim.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        {claim.confidence_score ? (
                          <span className={`font-mono text-sm ${claim.confidence_score >= 0.9 ? "text-[#27a644]" : claim.confidence_score >= 0.7 ? "text-amber-700" : "text-[#b53333]"}`}>
                            {(claim.confidence_score * 100).toFixed(0)}%
                          </span>
                        ) : <span className="text-[#b0aea5]">—</span>}
                      </TableCell>
                      <TableCell className="text-[#87867f] text-sm hidden md:table-cell">{claim.treatment_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
