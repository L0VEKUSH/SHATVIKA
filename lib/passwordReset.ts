import { createHash, randomBytes } from 'node:crypto';

const RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

type Environment = Record<string, string | undefined>;

export type PasswordResetDeliveryConfig = {
  apiKey: string;
  from: string;
  applicationOrigin: string;
};

export function createPasswordResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString('hex');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isPasswordResetTokenFormat(token: string): boolean {
  return /^[a-f\d]{64}$/i.test(token);
}

export function getPasswordResetDeliveryConfig(
  environment: Environment = process.env,
): PasswordResetDeliveryConfig | null {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.PASSWORD_RESET_FROM_EMAIL?.trim();
  const applicationUrl = (environment.NEXT_PUBLIC_APP_URL || environment.NEXT_PUBLIC_SITE_URL)?.trim();
  if (!apiKey || !from || !applicationUrl || !/^\S+@\S+\.\S+$/.test(from)) return null;

  try {
    const parsed = new URL(applicationUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (environment.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
    return { apiKey, from, applicationOrigin: parsed.origin };
  } catch {
    return null;
  }
}

export function buildPasswordResetUrl(config: PasswordResetDeliveryConfig, token: string): string {
  if (!isPasswordResetTokenFormat(token)) throw new Error('INVALID_RESET_TOKEN');
  const url = new URL('/auth/reset-password', config.applicationOrigin);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendPasswordResetEmail(input: {
  recipient: string;
  token: string;
  config: PasswordResetDeliveryConfig;
  fetchImplementation?: typeof fetch;
}): Promise<void> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const resetUrl = buildPasswordResetUrl(input.config, input.token);
  const idempotencyKey = hashPasswordResetToken(`password-reset:${input.recipient}:${input.token}`);
  const response = await fetchImplementation('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: input.config.from,
      to: [input.recipient],
      subject: 'Reset your SHATVIKA CORNER password',
      text: [
        'A password reset was requested for your SHATVIKA CORNER account.',
        '',
        `Use this single-use link within 15 minutes: ${resetUrl}`,
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`EMAIL_PROVIDER_REJECTED_${response.status}`);
}
