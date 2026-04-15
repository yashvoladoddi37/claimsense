// GET /api/claims/[id] — Get claim detail

import { db } from '@/lib/db';
import '@/lib/db/seed';
import { claims } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const claim = await db.select().from(claims).where(eq(claims.id, id)).get();

    if (!claim) {
      return Response.json({ error: 'Claim not found' }, { status: 404 });
    }

    // Parse JSON fields for response
    return Response.json({
      ...claim,
      input_data: claim.input_data_json ? JSON.parse(claim.input_data_json) : null,
      documents: claim.documents_json ? JSON.parse(claim.documents_json) : null,
      extraction: claim.extraction_json ? JSON.parse(claim.extraction_json) : null,
      decision_reasons: claim.decision_reasons_json ? JSON.parse(claim.decision_reasons_json) : [],
      pipeline_result: claim.pipeline_result_json ? JSON.parse(claim.pipeline_result_json) : [],
      reviewer_overrides: claim.reviewer_overrides_json ? JSON.parse(claim.reviewer_overrides_json) : [],
    });
  } catch (error) {
    console.error('Claim detail error:', error);
    return Response.json({ error: 'Failed to fetch claim' }, { status: 500 });
  }
}
