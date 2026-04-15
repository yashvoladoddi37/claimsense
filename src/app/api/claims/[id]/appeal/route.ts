// POST /api/claims/[id]/appeal — Submit appeal

import { db } from '@/lib/db';
import { claims } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length < 10) {
      return Response.json(
        { error: 'Appeal reason must be at least 10 characters' },
        { status: 400 }
      );
    }

    const claim = await db.select().from(claims).where(eq(claims.id, id)).get();
    if (!claim) {
      return Response.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claim.status !== 'REJECTED' && claim.status !== 'PARTIAL') {
      return Response.json(
        { error: 'Only rejected or partially approved claims can be appealed' },
        { status: 400 }
      );
    }

    if (claim.appeal_status === 'PENDING') {
      return Response.json(
        { error: 'An appeal is already pending for this claim' },
        { status: 400 }
      );
    }

    await db.update(claims)
      .set({
        appeal_status: 'PENDING',
        appeal_reason: reason,
        status: 'APPEALED',
        updated_at: new Date().toISOString(),
      })
      .where(eq(claims.id, id))
      .run();

    return Response.json({
      message: 'Appeal submitted successfully',
      claim_id: id,
      appeal_status: 'PENDING',
    });
  } catch (error) {
    console.error('Appeal error:', error);
    return Response.json({ error: 'Failed to submit appeal' }, { status: 500 });
  }
}
