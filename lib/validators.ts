import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Validate email format
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(normalized)) {
    return { valid: false, error: 'Email format is invalid' };
  }

  if (normalized.length > 255) {
    return { valid: false, error: 'Email is too long (max 255 characters)' };
  }

  return { valid: true };
}

/**
 * Validate password strength:
 * - 8+ characters
 * - at least 1 uppercase letter
 * - at least 1 lowercase letter
 * - at least 1 number
 * - at least 1 special character
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&* etc)');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Indian phone number (10 digits)
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  const normalized = phone.trim().replace(/\D/g, '');

  if (normalized.length !== 10) {
    return { valid: false, error: 'Phone number must be 10 digits' };
  }

  if (!/^\d{10}$/.test(normalized)) {
    return { valid: false, error: 'Phone number must contain only digits' };
  }

  return { valid: true };
}

/**
 * Validate full name
 */
export function validateFullName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Full name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Full name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Full name must not exceed 100 characters' };
  }

  // Allow letters, spaces, hyphens, apostrophes
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
    return { valid: false, error: 'Full name can only contain letters, spaces, hyphens, and apostrophes' };
  }

  return { valid: true };
}
