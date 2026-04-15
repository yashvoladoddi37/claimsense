"use client";
import { useState, useEffect, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TestCase { case_id: string; case_name: string; description: string; input_data: any; expected_output: any; }

interface TestResult {
  case_id: string;
  case_name: string;
  passed: boolean;
  expected_decision: string;
  actual_decision: string;
  expected_amount?: number;
  actual_amount: number;
  expected_reasons?: string[];
  actual_reasons: string[];
  details: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decision: Record<string, any>;
}

const DECISION_COLORS: Record<string, string> = {
  APPROVED: "bg-[#27a644]/15 text-[#27a644]",
  REJECTED: "bg-[#b53333]/10 text-[#b53333]",
  PARTIAL: "bg-amber-600/10 text-amber-700",
  MANUAL_REVIEW: "bg-orange-500/10 text-orange-700",
};

export default function TestRunner() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [loading, setLoading] = useState(false);
  const [runningCase, setRunningCase] = useState<string | null>(null);
  const [summary, setSummary] = useState({ total: 0, passed: 0, failed: 0 });
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Load test cases from the JSON file on mount
  useEffect(() => {
    fetch("/test_cases.json")
      .then(r => r.json())
      .then(data => setTestCases(data.test_cases || []))
      .catch(() => {
        // Fallback: try to get from the data directory or inline
        fetch("/api/test-cases?list=true")
          .then(r => r.json())
          .then(data => setTestCases(data.test_cases || []))
          .catch(() => {});
      });
  }, []);

  async function runAllTests() {
    setLoading(true);
    setResults({});
    try {
      const res = await fetch("/api/test-cases");
      const data = await res.json();
      const resultMap: Record<string, TestResult> = {};
      for (const r of (data.results || [])) {
        resultMap[r.case_id] = r;
      }
      setResults(resultMap);
      setSummary({ total: data.total, passed: data.passed, failed: data.failed });
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }

  async function runSingleTest(tc: TestCase) {
    setRunningCase(tc.case_id);
    try {
      const res = await fetch("/api/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc.input_data),
      });
      const data = await res.json();
      const decision = data.decision;
      const expected = tc.expected_output;
      const passed = decision.decision === expected.decision &&
        (expected.approved_amount === undefined || decision.approved_amount === expected.approved_amount);
      const result: TestResult = {
        case_id: tc.case_id,
        case_name: tc.case_name,
        passed,
        expected_decision: expected.decision,
        actual_decision: decision.decision,
        expected_amount: expected.approved_amount,
        actual_amount: decision.approved_amount,
        expected_reasons: expected.rejection_reasons,
        actual_reasons: decision.rejection_reasons || [],
        details: passed ? "Test passed" : `Expected ${expected.decision}${expected.approved_amount ? ` (₹${expected.approved_amount})` : ""}, got ${decision.decision} (₹${decision.approved_amount})`,
        decision,
      };
      setResults(prev => ({ ...prev, [tc.case_id]: result }));
      // Update summary
      const allResults = { ...results, [tc.case_id]: result };
      const resultValues = Object.values(allResults);
      setSummary({
        total: resultValues.length,
        passed: resultValues.filter(r => r.passed).length,
        failed: resultValues.filter(r => !r.passed).length,
      });
    } catch (err) {
      console.error(err);
    } finally { setRunningCase(null); }
  }

  const hasResults = Object.keys(results).length > 0;

  function formatAmount(amount: number) {
    return `₹${amount?.toLocaleString()}`;
  }

  function renderInputSummary(tc: TestCase) {
    const d = tc.input_data;
    const docs = d.documents || {};
    return (
      <div className="text-xs space-y-1.5 text-[#5e5d59]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span><span className="font-medium text-[#141413]">Patient:</span> {d.member_name}</span>
          <span><span className="font-medium text-[#141413]">Amount:</span> {formatAmount(d.claim_amount)}</span>
          <span><span className="font-medium text-[#141413]">Date:</span> {d.treatment_date}</span>
          {d.hospital && <span><span className="font-medium text-[#141413]">Hospital:</span> {d.hospital}</span>}
        </div>
        {docs.prescription && (
          <div className="border-t border-[#f0eee6] pt-1.5 mt-1.5">
            <span className="font-medium text-[#141413]">Prescription:</span>{" "}
            Dr. {docs.prescription.doctor_name} ({docs.prescription.doctor_reg}) — {docs.prescription.diagnosis || "No diagnosis"}
            {docs.prescription.medicines_prescribed && (
              <span className="block ml-2">💊 {docs.prescription.medicines_prescribed.join(", ")}</span>
            )}
            {docs.prescription.procedures && (
              <span className="block ml-2">🔧 {docs.prescription.procedures.join(", ")}</span>
            )}
            {docs.prescription.tests_prescribed && (
              <span className="block ml-2">🔬 {docs.prescription.tests_prescribed.join(", ")}</span>
            )}
          </div>
        )}
        {docs.bill && (
          <div className="border-t border-[#f0eee6] pt-1.5 mt-1.5">
            <span className="font-medium text-[#141413]">Bill items:</span>{" "}
            {Object.entries(docs.bill).map(([k, v]) => `${k.replace(/_/g, " ")}: ₹${v}`).join(", ")}
          </div>
        )}
        {!docs.prescription && !docs.bill && (
          <div className="border-t border-[#f0eee6] pt-1.5 mt-1.5 text-amber-700">⚠️ No documents attached</div>
        )}
        {d.previous_claims_same_day && (
          <div className="text-amber-700">⚠️ {d.previous_claims_same_day} previous claims on same day</div>
        )}
        {d.cashless_request && <div>💳 Cashless request</div>}
      </div>
    );
  }

  function renderExpected(tc: TestCase) {
    const exp = tc.expected_output;
    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <Badge className={`${DECISION_COLORS[exp.decision] || ""} text-xs`}>{exp.decision}</Badge>
          {exp.approved_amount !== undefined && <span className="font-mono font-medium">{formatAmount(exp.approved_amount)}</span>}
        </div>
        {exp.rejection_reasons && (
          <div className="text-[#b53333]">Reasons: {exp.rejection_reasons.join(", ")}</div>
        )}
        {exp.rejected_items && (
          <div className="text-amber-700">Excluded: {exp.rejected_items.join(", ")}</div>
        )}
        {exp.deductions && Object.keys(exp.deductions).length > 0 && (
          <div>Deductions: {Object.entries(exp.deductions).map(([k, v]) => `${k}: ₹${v}`).join(", ")}</div>
        )}
        {exp.notes && <div className="italic">{exp.notes}</div>}
        {exp.flags && <div className="text-orange-700">🚩 {exp.flags.join(", ")}</div>}
        <div className="text-[#5e5d59]">Confidence: {((exp.confidence_score || 0) * 100).toFixed(0)}%</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#141413]">Test Runner</h1>
          <p className="text-[#5e5d59] text-sm">
            {testCases.length} test cases loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#f0eee6] rounded-md overflow-hidden text-sm">
            <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 ${viewMode === "cards" ? "bg-[#c96442] text-white" : "bg-[#faf9f5] hover:bg-[#f0eee6] text-[#141413]"}`}>Cards</button>
            <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 ${viewMode === "table" ? "bg-[#c96442] text-white" : "bg-[#faf9f5] hover:bg-[#f0eee6] text-[#141413]"}`}>Table</button>
          </div>
          <Button onClick={runAllTests} disabled={loading} size="lg">
            {loading ? "Running..." : "Run All"}
          </Button>
        </div>
      </div>

      {/* Summary (shown when tests have been run) */}
      {hasResults && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-[#faf9f5] border-[#f0eee6]"><CardHeader className="pb-2"><CardTitle className="text-sm text-[#5e5d59]">Total Run</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-[#141413]">{summary.total}</div></CardContent></Card>
            <Card className="bg-[#faf9f5] border-[#27a644]/30"><CardHeader className="pb-2"><CardTitle className="text-sm text-[#27a644]">Passed</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-[#27a644]">{summary.passed}</div></CardContent></Card>
            <Card className={`bg-[#faf9f5] ${summary.failed > 0 ? "border-[#b53333]/30" : "border-[#27a644]/30"}`}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-[#b53333]">Failed</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-semibold text-[#b53333]">{summary.failed}</div></CardContent></Card>
          </div>
          <div className="w-full bg-[#f0eee6] rounded-full h-3">
            <div className="bg-[#27a644] h-3 rounded-full transition-all" style={{ width: `${summary.total > 0 ? (summary.passed / summary.total) * 100 : 0}%` }} />
          </div>
        </>
      )}

      {/* Card View */}
      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testCases.map(tc => {
            const result = results[tc.case_id];
            const isRunning = runningCase === tc.case_id;
            const isExpanded = expandedCase === tc.case_id;
            return (
              <Card key={tc.case_id} className={`transition-all bg-[#faf9f5] ${result ? (result.passed ? "border-[#27a644]/30 bg-[#27a644]/5" : "border-[#b53333]/30 bg-[#b53333]/5") : "border-[#f0eee6] hover:border-[#c96442]/30"}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#5e5d59]">{tc.case_id}</span>
                      {result && <span>{result.passed ? "✅" : "❌"}</span>}
                    </div>
                    <Button size="sm" variant={result ? "ghost" : "outline"} disabled={isRunning || loading}
                      onClick={() => runSingleTest(tc)} className="h-7 text-xs">
                      {isRunning ? "Running..." : result ? "Re-run" : "▶ Run"}
                    </Button>
                  </div>
                  <CardTitle className="text-sm leading-tight text-[#141413]">{tc.case_name}</CardTitle>
                  <p className="text-xs text-[#5e5d59]">{tc.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Input Summary */}
                  <div>
                    <button onClick={() => setExpandedCase(isExpanded ? null : tc.case_id)}
                      className="text-xs font-medium text-[#c96442] hover:underline flex items-center gap-1 mb-1">
                      {isExpanded ? "▼" : "▶"} Input Details
                    </button>
                    {isExpanded && (
                      <div className="bg-[#f0eee6] rounded-lg p-2.5 border border-[#f0eee6]">
                        {renderInputSummary(tc)}
                      </div>
                    )}
                  </div>

                  {/* Expected Output */}
                  <div>
                    <p className="text-xs font-medium mb-1 text-[#141413]">Expected Output:</p>
                    <div className="bg-[#f0eee6] rounded-lg p-2.5 border border-[#f0eee6]">
                      {renderExpected(tc)}
                    </div>
                  </div>

                  {/* Actual Result (after running) */}
                  {result && (
                    <div>
                      <p className="text-xs font-medium mb-1 text-[#141413]">Actual Result:</p>
                      <div className={`rounded-lg p-2.5 border text-xs space-y-1 ${result.passed ? "bg-[#27a644]/5 border-[#27a644]/20" : "bg-[#b53333]/5 border-[#b53333]/20"}`}>
                        <div className="flex items-center gap-2">
                          <Badge className={`${DECISION_COLORS[result.actual_decision] || ""} text-xs`}>{result.actual_decision}</Badge>
                          <span className="font-mono font-medium text-[#141413]">{formatAmount(result.actual_amount)}</span>
                        </div>
                        {result.actual_reasons.length > 0 && (
                          <div className="text-[#b53333]">Reasons: {result.actual_reasons.join(", ")}</div>
                        )}
                        <p className="text-[#5e5d59]">{result.details}</p>
                        <button onClick={() => setExpandedCase(expandedCase === tc.case_id + "_detail" ? null : tc.case_id + "_detail")}
                          className="text-[#c96442] hover:underline text-xs">
                          {expandedCase === tc.case_id + "_detail" ? "Hide" : "Show"} full pipeline output
                        </button>
                        {expandedCase === tc.case_id + "_detail" && (
                          <pre className="bg-[#faf9f5] p-2 rounded text-xs overflow-auto max-h-48 border border-[#f0eee6] text-[#141413]">
                            {JSON.stringify(result.decision, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="bg-[#faf9f5] border-[#f0eee6]">
          <CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#f0eee6]">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-20 text-[#5e5d59]">ID</TableHead>
                  <TableHead className="text-[#5e5d59]">Scenario</TableHead>
                  <TableHead className="text-[#5e5d59]">Patient</TableHead>
                  <TableHead className="text-right text-[#5e5d59]">Amount</TableHead>
                  <TableHead className="text-[#5e5d59]">Expected</TableHead>
                  <TableHead className="text-[#5e5d59]">Actual</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map(tc => {
                  const result = results[tc.case_id];
                  const isRunning = runningCase === tc.case_id;
                  const isExpanded = expandedCase === tc.case_id;
                  return (
                    <Fragment key={tc.case_id}>
                      <TableRow key={tc.case_id} className="cursor-pointer hover:bg-[#f0eee6] border-[#f0eee6]"
                        onClick={() => setExpandedCase(isExpanded ? null : tc.case_id)}>
                        <TableCell>{result ? (result.passed ? "✅" : "❌") : "⬜"}</TableCell>
                        <TableCell className="font-mono text-xs text-[#5e5d59]">{tc.case_id}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-[#141413]">{tc.case_name}</div>
                          <div className="text-xs text-[#5e5d59]">{tc.description}</div>
                        </TableCell>
                        <TableCell className="text-sm text-[#141413]">{tc.input_data.member_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-[#141413]">{formatAmount(tc.input_data.claim_amount)}</TableCell>
                        <TableCell>
                          <Badge className={`${DECISION_COLORS[tc.expected_output.decision] || ""} text-xs`}>
                            {tc.expected_output.decision}
                          </Badge>
                          {tc.expected_output.approved_amount !== undefined && (
                            <span className="block text-xs font-mono mt-0.5 text-[#141413]">{formatAmount(tc.expected_output.approved_amount)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {result ? (
                            <>
                              <Badge className={`${result.passed ? "bg-[#27a644]/15 text-[#27a644]" : "bg-[#b53333]/10 text-[#b53333]"} text-xs`}>
                                {result.actual_decision}
                              </Badge>
                              <span className="block text-xs font-mono mt-0.5 text-[#141413]">{formatAmount(result.actual_amount)}</span>
                            </>
                          ) : <span className="text-xs text-[#5e5d59]">Not run</span>}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" disabled={isRunning || loading}
                            onClick={(e) => { e.stopPropagation(); runSingleTest(tc); }} className="h-7 text-xs">
                            {isRunning ? "..." : "▶"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${tc.case_id}-expand`}>
                          <TableCell colSpan={8} className="bg-[#f0eee6]/50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-2">
                              <div>
                                <p className="text-xs font-medium mb-1.5 text-[#141413]">Input Details:</p>
                                <div className="bg-[#faf9f5] rounded-lg p-2.5 border border-[#f0eee6]">
                                  {renderInputSummary(tc)}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-medium mb-1.5 text-[#141413]">Expected Output:</p>
                                <div className="bg-[#faf9f5] rounded-lg p-2.5 border border-[#f0eee6]">
                                  {renderExpected(tc)}
                                </div>
                                {result && (
                                  <>
                                    <p className="text-xs font-medium mt-2 mb-1.5 text-[#141413]">Pipeline Output:</p>
                                    <pre className="bg-[#faf9f5] p-2.5 rounded-lg text-xs overflow-auto max-h-48 border border-[#f0eee6] text-[#141413]">
                                      {JSON.stringify(result.decision, null, 2)}
                                    </pre>
                                  </>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {testCases.length === 0 && (
        <Card className="bg-[#faf9f5] border-[#f0eee6]">
          <CardContent className="py-12 text-center text-[#5e5d59]">
            <p className="text-lg mb-2">Loading test cases...</p>
            <p className="text-sm">Make sure test_cases.json is available in the public directory.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
