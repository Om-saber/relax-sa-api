# Security checklist

## Secrets

- [x] `.env` is **not** tracked; only `.env.example` is committed.
- [ ] Rotate any secret that ever appeared in a repository (frontend Firebase keys).
- [ ] Store production secrets in the platform's secret manager, never in `.env` on disk.
- [ ] Different secrets per environment (dev/staging/prod).

## Authentication

- [x] Passwords hashed with Argon2.
- [x] Access tokens are short-lived (15m).
- [x] Refresh tokens are stored **hashed** and rotated on every use.
- [x] `tokenVersion` allows instant global revocation.
- [x] OTP stored hashed (SHA-256 + pepper), 5-minute TTL, max 3 attempts.
- [x] OTP resend cooldown (60s) and endpoint rate limiting.
- [ ] TOTP 2FA for `manageFinance` / `manageRoles` (Phase 5).

## Authorization

- [x] Global JWT guard; every route is private unless marked `@Public()`.
- [x] Permission guard on admin routes; permissions embedded in the access token.
- [ ] Ownership checks on client resources (`/me/*` must scope by `userId`).
- [ ] Staff can only change status of their **own** bookings.

## Input & output

- [x] Whitelist validation (`whitelist`, `forbidNonWhitelisted`).
- [x] No stack traces or internal paths in API responses.
- [x] Request IDs on every response for correlation.
- [ ] Body size limits on uploads.
- [ ] Regex escaping for search inputs (avoid ReDoS).

## Transport & headers

- [x] Helmet.
- [x] CORS allow-list (no `*` with credentials).
- [ ] HTTPS/HSTS terminated at the proxy.
- [ ] CSP on the frontend (Vercel).

## Data

- [ ] PDPL review (lawful basis, retention, deletion).
- [ ] Encrypt backups; test restore.
- [ ] Audit log for money and permission changes.
- [ ] Soft delete only where required; hard-delete PII on request.

## Money

- [x] `Decimal(10,2)` — never floats.
- [x] DB check constraints for non-negative totals and balances.
- [ ] Webhooks verified by signature + idempotency key.
- [ ] Every refund writes an audit entry.

## Operations

- [ ] Rate limiting tuned per endpoint (auth, OTP, bookings).
- [ ] Dependency scanning (`npm audit`, Dependabot).
- [ ] Sentry + uptime monitoring.
- [ ] Backups: daily full + PITR if available.
