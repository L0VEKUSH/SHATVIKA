import { getBusinessRules } from '@/lib/businessRules';
import { getFulfillmentCapabilities } from '@/lib/businessRules';
import { getCounterLocationConfiguration } from '@/lib/locations';
import { getPasswordResetDeliveryConfig } from '@/lib/passwordReset';
import { workerSessionConfigurationIssue } from '@/lib/workerSessionConfig';

type Environment = Record<string, string | undefined>;
type IntegrationState = 'configured' | 'disabled' | 'misconfigured';

export interface RuntimeConfigurationHealth {
  ready: boolean;
  required: {
    canonicalOrigin: boolean;
    sessionSecurity: boolean;
    checkoutRules: boolean;
  };
  integrations: {
    passwordResetEmail: IntegrationState;
    durableMedia: IntegrationState;
    onlinePayments: 'disabled';
  };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function hasSecureIndependentSecrets(environment: Environment): boolean {
  const secrets = [
    environment.ADMIN_JWT_SECRET?.trim(),
    environment.CUSTOMER_JWT_SECRET?.trim(),
    environment.WORKER_JWT_SECRET?.trim(),
    environment.CSRF_SECRET?.trim(),
  ];
  const minimumBytes = environment.NODE_ENV === 'production' ? 32 : 1;
  return workerSessionConfigurationIssue(environment) === null
    && secrets.every((secret): secret is string => Boolean(secret) && byteLength(secret!) >= minimumBytes)
    && new Set(secrets).size === secrets.length;
}

function hasCanonicalOrigin(environment: Environment): boolean {
  const candidates = [environment.NEXT_PUBLIC_APP_URL, environment.NEXT_PUBLIC_SITE_URL]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return false;

  try {
    const urls = candidates.map(value => new URL(value));
    if (urls.some(url => !['http:', 'https:'].includes(url.protocol))) return false;
    if (environment.NODE_ENV === 'production' && urls.some(url => url.protocol !== 'https:')) return false;
    return urls.every(url => url.origin === urls[0].origin);
  } catch {
    return false;
  }
}

function integrationState(
  values: Array<string | undefined>,
  configured: boolean,
): IntegrationState {
  const attempted = values.some(value => Boolean(value?.trim()));
  if (!attempted) return 'disabled';
  return configured ? 'configured' : 'misconfigured';
}

export function assessRuntimeConfiguration(
  environment: Environment = process.env,
): RuntimeConfigurationHealth {
  let checkoutRules = false;
  try {
    getBusinessRules(environment);
    const capabilities = getFulfillmentCapabilities(environment);
    const location = getCounterLocationConfiguration(environment);
    checkoutRules = location.explicit
      && environment.DELIVERY_ENABLED?.trim().toLowerCase() === 'false'
      && capabilities.deliveryEnabled === false
      && Boolean(capabilities.locationId)
      && Boolean(capabilities.timeZone);
  } catch {
    checkoutRules = false;
  }

  const passwordResetEmail = integrationState(
    [environment.RESEND_API_KEY, environment.PASSWORD_RESET_FROM_EMAIL],
    Boolean(getPasswordResetDeliveryConfig(environment)),
  );

  const mediaValues = [
    environment.MEDIA_STORAGE_PROVIDER,
    environment.CLOUDINARY_CLOUD_NAME,
    environment.CLOUDINARY_API_KEY,
    environment.CLOUDINARY_API_SECRET,
  ];
  const durableMedia = integrationState(
    mediaValues,
    environment.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase() === 'cloudinary'
      && mediaValues.slice(1).every(value => Boolean(value?.trim())),
  );

  const required = {
    canonicalOrigin: hasCanonicalOrigin(environment),
    sessionSecurity: hasSecureIndependentSecrets(environment),
    checkoutRules,
  };
  const integrations = {
    passwordResetEmail,
    durableMedia,
    onlinePayments: 'disabled' as const,
  };

  return {
    ready: Object.values(required).every(Boolean)
      && passwordResetEmail !== 'misconfigured'
      && durableMedia !== 'misconfigured',
    required,
    integrations,
  };
}
