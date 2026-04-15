import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

// ---------- Members Table ----------
export const members = sqliteTable('members', {
  id: text('id').primaryKey(),                    // "EMP001"
  name: text('name').notNull(),
  join_date: text('join_date').notNull(),          // ISO date
  policy_start_date: text('policy_start_date').notNull(),
  policy_id: text('policy_id').default('OPD_ADVANTAGE_2024'),
});

// ---------- Claims Table (denormalized — everything in one row) ----------
export const claims = sqliteTable('claims', {
  id: text('id').primaryKey(),                     // "CLM_00001"
  member_id: text('member_id').notNull(),
  member_name: text('member_name').notNull(),
  status: text('status').notNull().default('PROCESSING'),
  claim_amount: real('claim_amount').notNull(),
  approved_amount: real('approved_amount'),
  treatment_date: text('treatment_date').notNull(),
  submission_date: text('submission_date').notNull(),
  hospital: text('hospital'),
  cashless_request: integer('cashless_request', { mode: 'boolean' }).default(false),

  // Input data (structured JSON from form or test case)
  input_data_json: text('input_data_json'),

  // Document storage (base64 + metadata)
  documents_json: text('documents_json'),

  // AI extraction result
  extraction_json: text('extraction_json'),

  // Decision fields
  decision: text('decision'),
  decision_reasons_json: text('decision_reasons_json'),
  decision_notes: text('decision_notes'),
  confidence_score: real('confidence_score'),
  processing_time_ms: integer('processing_time_ms'),

  // Full pipeline result (all steps)
  pipeline_result_json: text('pipeline_result_json'),

  // Appeal
  appeal_status: text('appeal_status'),
  appeal_reason: text('appeal_reason'),

  // Human-in-the-loop review (Agentic AI workflow)
  reviewer_decision: text('reviewer_decision'),       // Final decision after human review
  reviewer_notes: text('reviewer_notes'),             // Reviewer's notes/reasoning
  reviewer_overrides_json: text('reviewer_overrides_json'), // Per-agent overrides JSON
  reviewed_at: text('reviewed_at'),                   // ISO timestamp
  reviewed_by: text('reviewed_by'),                   // Reviewer identifier

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
