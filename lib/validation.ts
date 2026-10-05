import { NextResponse } from 'next/server';
import { z, type ZodError } from 'zod';

export const operationalReasonSchema = z.string({ error: 'Reason must be text.' })
  .trim()
  .min(3, { error: 'Reason must contain at least 3 characters.' })
  .max(300, { error: 'Reason cannot exceed 300 characters.' });

export function validationErrorResponse(
  error: ZodError,
  message = 'Check the submitted fields and try again.',
) {
  return NextResponse.json({
    ok: false,
    error: 'VALIDATION_FAILED',
    message,
    details: error.flatten(),
  }, { status: 422 });
}
