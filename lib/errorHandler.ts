import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
  }
}

export function handleApiError(error: unknown) {

  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.statusCode }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_ERROR', details: error.flatten() },
      { status: 400 }
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    { status: 500 }
  );
}

export function validateRequired(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') {
    throw new AppError(`${field} is required`, 400, 'MISSING_FIELD');
  }
  return value;
}

export function validateType(value: unknown, expectedType: string, field: string) {
  if (typeof value !== expectedType) {
    throw new AppError(`${field} must be ${expectedType}`, 400, 'INVALID_TYPE');
  }
  return value;
}

export function validateEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Invalid email format', 400, 'INVALID_EMAIL');
  }
  return email;
}

export function validateUrl(url: string) {
  try {
    new URL(url);
    return url;
  } catch {
    throw new AppError('Invalid URL format', 400, 'INVALID_URL');
  }
}
