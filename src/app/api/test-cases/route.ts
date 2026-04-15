// GET /api/test-cases — Run all test cases and return results
// POST /api/test-cases — Run a single test case

import { NextRequest } from 'next/server';
import { runAllTestCases } from '@/lib/engine/test-runner';
import { adjudicate } from '@/lib/engine/pipeline';
import { ClaimInput, Member } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Pre-built members for test cases
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

export async function GET() {
  try {
    const results = runAllTestCases();
    const passedCount = results.filter(r => r.passed).length;

    return Response.json({
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
      results,
    });
  } catch (error) {
    console.error('Test runner error:', error);
    return Response.json({ error: 'Failed to run tests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const claimInput: ClaimInput = await request.json();
    const member = TEST_MEMBERS[claimInput.member_id] || null;
    const decision = adjudicate(claimInput, { member }, 'TEST_' + Date.now());

    return Response.json({ decision });
  } catch (error) {
    console.error('Single test error:', error);
    return Response.json({ error: 'Failed to process test case' }, { status: 500 });
  }
}
