import { runAllTestCases } from '../src/lib/engine/test-runner';

console.log('\n🏥 ClaimSense — OPD Adjudication Test Suite\n');
console.log('='.repeat(70));

const results = runAllTestCases();

let passed = 0;
let failed = 0;

for (const r of results) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`\n${icon} ${r.case_id}: ${r.case_name}`);
  console.log(`   Expected: ${r.expected_decision}${r.expected_amount !== undefined ? ` (₹${r.expected_amount})` : ''}`);
  console.log(`   Actual:   ${r.actual_decision} (₹${r.actual_amount})`);
  if (!r.passed) {
    console.log(`   ⚠️  ${r.details}`);
    // Show step details for debugging
    for (const step of r.decision.steps) {
      const stepIcon = step.passed ? '  ✓' : '  ✗';
      console.log(`   ${stepIcon} ${step.step}: ${step.details}`);
    }
  }
  if (r.passed) passed++;
  else failed++;
}

console.log('\n' + '='.repeat(70));
console.log(`\n📊 Results: ${passed}/${results.length} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('🎉 All test cases passed!\n');
} else {
  console.log(`⚠️  ${failed} test case(s) need attention.\n`);
  process.exit(1);
}
