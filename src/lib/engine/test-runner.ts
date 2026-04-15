// ============================================================
// Test Runner — validates rule engine against test_cases.json
// ============================================================

import { adjudicate } from './pipeline';
import { ClaimInput, Member, Decision } from '../types';
import testCasesData from '../../../test_cases.json';

// Pre-built member records matching test cases
const TEST_MEMBERS: Record<string, Member> = {
  EMP001: { id: 'EMP001', name: 'Rajesh Kumar', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP002: { id: 'EMP002', name: 'Priya Singh', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP003: { id: 'EMP003', name: 'Amit Verma', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP004: { id: 'EMP004', name: 'Sneha Reddy', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP005: { id: 'EMP005', name: 'Vikram Joshi', join_date: '2024-09-01', policy_start_date: '2024-09-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP006: { id: 'EMP006', name: 'Kavita Nair', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP007: { id: 'EMP007', name: 'Suresh Patil', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP008: { id: 'EMP008', name: 'Ravi Menon', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP009: { id: 'EMP009', name: 'Anita Desai', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
  EMP010: { id: 'EMP010', name: 'Deepak Shah', join_date: '2024-01-01', policy_start_date: '2024-01-01', policy_id: 'OPD_ADVANTAGE_2024' },
};

export interface TestResult {
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
  decision: Decision;
}

export function runAllTestCases(): TestResult[] {
  const results: TestResult[] = [];

  for (const tc of testCasesData.test_cases) {
    const input: ClaimInput = {
      member_id: tc.input_data.member_id,
      member_name: tc.input_data.member_name,
      treatment_date: tc.input_data.treatment_date,
      claim_amount: tc.input_data.claim_amount,
      hospital: (tc.input_data as Record<string, unknown>).hospital as string | undefined,
      cashless_request: (tc.input_data as Record<string, unknown>).cashless_request as boolean | undefined,
      previous_claims_same_day: (tc.input_data as Record<string, unknown>).previous_claims_same_day as number | undefined,
      member_join_date: (tc.input_data as Record<string, unknown>).member_join_date as string | undefined,
      documents: tc.input_data.documents as ClaimInput['documents'],
    };

    const member = TEST_MEMBERS[input.member_id] || null;
    const decision = adjudicate(input, { member }, tc.case_id);
    const expected = tc.expected_output;

    // Check decision match
    const decisionMatch = decision.decision === expected.decision;

    // Check amount match (if applicable)
    const expectedAmount = (expected as Record<string, unknown>).approved_amount as number | undefined;
    const amountMatch = expectedAmount === undefined || decision.approved_amount === expectedAmount;

    // Check rejection reasons (if applicable)
    const expectedReasons = (expected as Record<string, unknown>).rejection_reasons as string[] | undefined;
    const reasonsMatch = !expectedReasons || expectedReasons.every(r =>
      decision.rejection_reasons.includes(r as typeof decision.rejection_reasons[number])
    );

    const passed = decisionMatch && amountMatch && reasonsMatch;

    const details: string[] = [];
    if (!decisionMatch) details.push(`Decision: expected ${expected.decision}, got ${decision.decision}`);
    if (!amountMatch) details.push(`Amount: expected ₹${expectedAmount}, got ₹${decision.approved_amount}`);
    if (!reasonsMatch) details.push(`Reasons: expected [${expectedReasons?.join(', ')}], got [${decision.rejection_reasons.join(', ')}]`);

    results.push({
      case_id: tc.case_id,
      case_name: tc.case_name,
      passed,
      expected_decision: expected.decision,
      actual_decision: decision.decision,
      expected_amount: expectedAmount,
      actual_amount: decision.approved_amount,
      expected_reasons: expectedReasons,
      actual_reasons: decision.rejection_reasons,
      details: passed ? 'All checks passed' : details.join('; '),
      decision,
    });
  }

  return results;
}
