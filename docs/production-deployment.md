# Pulse production deployment

Pulse is a multi-service product, not a static website. A reliable deployment needs an API, admin web service, PostgreSQL, a background news worker, object storage, realtime media, transactional email, AI drafting, DNS/TLS, monitoring, backups, and signed mobile builds.

## Recommended first production stack

- **Application compute and PostgreSQL:** Render Blueprint (`render.yaml`). This keeps the existing Fastify and PostgreSQL implementation intact and supplies health checks, private networking, deploy hooks, logs, and managed database backups.
- **DNS, CDN, WAF and admin identity gate:** Cloudflare. Put the public API and admin hostnames behind Cloudflare. Protect the admin hostname with Cloudflare Access, and disable the provider's default admin hostname after the custom domain is verified.
- **User media:** Cloudflare R2. The current database-backed base64 media paths must be migrated before a public launch with substantial uploads.
- **Realtime rooms:** LiveKit Cloud. Configure a `wss://` public URL and production API credentials.
- **Email verification and password recovery:** Resend with a verified sender domain.
- **News drafting:** Ollama Cloud. Keep its API key only on the API service.
- **Mobile delivery:** Expo EAS signed Android/iOS builds with `EXPO_PUBLIC_API_URL=https://api.<domain>` and the production LiveKit URL.

## Deployment order

1. Put the repository in a private Git host. Do not commit `.env` files, API keys, database dumps, screenshots, or build artifacts.
2. Create the Render Blueprint from `render.yaml`. Enter all `sync: false` secrets when prompted. The `ADMIN_API_KEY` value must be identical on the API, admin, and news-worker services.
3. Run and verify every migration before accepting traffic. Seed only reference geography; do not run demo-user seeds in production.
4. Configure `api.<domain>` and `admin.<domain>`, then proxy them through Cloudflare with TLS Full (strict).
5. Put Cloudflare Access in front of the entire admin hostname. Only named administrators should be allowed.
6. Provision LiveKit Cloud, Resend, Ollama Cloud, and R2 credentials. Rotate every secret that has ever been used locally.
7. Migrate local PostgreSQL data through an encrypted dump/restore window, validate record counts, then keep the local database read-only until rollback risk has passed.
8. Build mobile binaries with production URLs. Test authentication, feeds, uploads, chat, Live rooms, verification, moderation, polls, news review/publish, password recovery, notifications, and account deletion on physical devices.
9. Enable uptime checks, error tracking, log alerts, database backup verification, billing alerts, WAF rate limits, and a documented rollback procedure.

## Launch blockers that remain

- No Git remote currently exists for this workspace.
- No custom domain is present in the inspected Cloudflare account.
- No paid application/database services have been authorized yet.
- Media is still stored as base64 in PostgreSQL. R2 migration is required before high-volume public uploads.
- Admin access currently relies on a server-side shared key; Cloudflare Access or an equivalent identity-aware proxy must protect the admin hostname.
- Store publishing requires Apple and Google developer accounts, legal store metadata, privacy disclosures, signing, and human review.

## Required production secrets

`DATABASE_URL`, `JWT_SECRET`, `ADMIN_API_KEY`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OLLAMA_API_KEY`.

Production startup now fails if development secrets, non-PostgreSQL database URLs, non-TLS LiveKit URLs, or missing email delivery configuration are detected.
