// POST /api/claims/[id]/review — Human-in-the-loop review (Agentic AI workflow)
// Allows a reviewer to accept, override, or modify AI agent recommendations

import { db } from '@/lib/db';
import { claims } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface AgentOverride {
  step: string;
  original_recommendation: string;
  reviewer_action: 'ACCEPT' | 'OVERRIDE';
  override_decision?: string;
  reviewer_comment?: string;
}

interface ReviewPayload {
  final_decision: 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'MANUAL_REVIEW';
  approved_amount?: number;
  reviewer_notes: string;
  reviewed_by: string;
  agent_overrides: AgentOverride[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: ReviewPayload = await request.json();

    if (!body.final_decision || !body.reviewer_notes || !body.reviewed_by) {
      return Response.json(
        { error: 'final_decision, reviewer_notes, and reviewed_by are required' },
        { status: 400 }
      );
    }

    const claim = await db.select().from(claims).where(eq(claims.id, id)).get();
    if (!claim) {
      return Response.json({ error: 'Claim not found' }, { status: 404 });
    }

    // Determine approved amount
    let approvedAmount = body.approved_amount;
    if (approvedAmount === undefined) {
      if (body.final_decision === 'REJECTED') {
        approvedAmount = 0;
      } else if (body.final_decision === 'APPROVED') {
        approvedAmount = claim.claim_amount;
      } else {
        approvedAmount = claim.approved_amount ?? 0;
      }
    }

    const now = new Date().toISOString();

    await db.update(claims)
      .set({
        status: body.final_decision,
        decision: body.final_decision,
        approved_amount: approvedAmount,
        reviewer_decision: body.final_decision,
        reviewer_notes: body.reviewer_notes,
        reviewer_overrides_json: JSON.stringify(body.agent_overrides || []),
        reviewed_at: now,
        reviewed_by: body.reviewed_by,
        decision_notes: `[Reviewed by ${body.reviewed_by}] ${body.reviewer_notes}`,
        updated_at: now,
      })
      .where(eq(claims.id, id))
      .run();

    return Response.json({
      message: 'Review submitted successfully',
      claim_id: id,
      final_decision: body.final_decision,
      approved_amount: approvedAmount,
      reviewed_at: now,
    });
  } catch (error) {
    console.error('Review error:', error);
    return Response.json({ error: 'Failed to submit review' }, { status: 500 });
  }
}
