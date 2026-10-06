``# Security rotation required

Credentials and application secrets were exposed in IDE/pasted content and must
be treated as compromised. This document intentionally contains no secret
values.

## Rotation matrix

| Secret category | Where configured | Rotation required | Update after rotation |
|---|---|---:|---|
| MongoDB credentials | `.env.local` (`MONGODB_URI`) and the production deployment secret store | Yes | Replace the Atlas database user password or user, update the full connection URI, then verify the configured database and application health checks |
| Admin JWT signing secret | `.env.local` (`ADMIN_JWT_SECRET`) and the production deployment secret store | Yes | Replace the value, restart all application instances, and invalidate existing admin sessions |
| Customer JWT signing secret | `.env.local` (`CUSTOMER_JWT_SECRET`) and the production deployment secret store | Yes | Replace the value, restart all application instances, and require customers to sign in again |
| Worker JWT signing secret | `.env.local` (`WORKER_JWT_SECRET`) and the production deployment secret store | Yes | Replace the value, restart worker-facing services, and invalidate existing worker sessions |
| CSRF secret | `.env.local` (`CSRF_SECRET`) and the production deployment secret store | Yes | Replace the value, restart all instances, and verify new CSRF tokens are accepted while old tokens are rejected |
| Admin bootstrap/setup key | `.env.local` (`ADMIN_SETUP_KEY`) and the production deployment secret store | Yes if configured or exposed | Replace or disable it after administrator setup; verify bootstrap remains disabled in production |
| Admin bootstrap credentials | `.env.local` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) and the deployment secret store | Yes if used or exposed | Change the administrator password through the supported administrative flow and remove bootstrap-only values |
| Google OAuth credentials | `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`) and the OAuth provider console | Rotate the client secret if configured or exposed | Update the deployment secret store and provider configuration, then verify the callback URL and sign-in flow |
| Resend email credentials | `.env.local` (`RESEND_API_KEY`, `PASSWORD_RESET_FROM_EMAIL`) and the email provider console | Rotate the API key if configured or exposed | Update the deployment secret store and verify password-reset email delivery |
| Cloudinary storage credentials | `.env.local` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) and the provider console | Rotate the API secret if configured or exposed | Update the deployment secret store and verify upload/delete operations |
| Worker provisioning credentials | `.env.local` (`WORKER_PROVISION_CONFIRM`, `WORKER_NAME`, `WORKER_EMAIL`, `WORKER_PASSWORD`, `WORKER_LOCATION_ID`) | Yes if present outside a controlled provisioning session | Remove one-time values after provisioning and rotate any resulting account password through the supported flow |

## Verification checklist

1. Rotate credentials at the relevant external provider or in the database
   administrator console. Do not rotate them by editing source files.
2. Update only the deployment secret store and the local ignored `.env.local`
   used for authorized local verification.
3. Confirm the repository contains no literal replacement values. `.env.example`
   must contain placeholders or empty values only.
4. Restart the application and verify MongoDB health, authentication,
   authorization, checkout, order/token, counter, inventory, and admin flows.
5. Confirm old JWT and CSRF material no longer authenticates requests.
6. Confirm OAuth, email, and storage integrations work only when explicitly
   configured.
7. Review provider audit logs for unauthorized access and revoke unknown
   sessions, API keys, OAuth clients, and database users.

``