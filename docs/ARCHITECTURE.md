# Architecture

## Production target

Use a TypeScript monorepo with `apps/mobile` (Expo), `apps/web` and `apps/admin` (Next.js), `apps/api` (NestJS/Fastify), and `apps/workers`. Shared packages own database access, API contracts, design tokens, authentication helpers, configuration, and testing.

Start as a modular monolith backed by PostgreSQL, Redis, S3-compatible storage, background queues, and WebSockets. Add OpenSearch and extract services only after measured load requires them.

## Domain modules

- identity
- profiles
- social graph
- posts and replies
- polls and voting
- feed ranking
- news and evidence
- chat
- notifications
- search
- moderation
- fraud and trust
- admin and audit
- analytics events

Modules own their rules and persistence boundaries. Cross-module effects use internal domain events and an outbox for reliable asynchronous processing.

## Critical flows

### Vote

Authenticate -> resolve audience preference -> check poll mode/comment rule -> rate limit -> collect risk signals -> atomic unique vote -> update aggregate -> emit event -> return a public-safe result. Private answer/comment text never enters the public presenter.

### Social feed

Authenticate -> validate bounded text -> persist post/comment -> project public profile fields -> exclude blocked and viewer-reported content -> cursor paginate -> return engagement counts and viewer-specific like/follow state. Feed projections never join or expose email, poll votes, private answers, location preferences, or report details.

### Location personalization

Explicit user tap -> foreground permission -> device reverse geocode -> save state/UT preference -> optional manual Lok Sabha constituency refinement -> choose the most-specific active poll (constituency, then state, then India). Raw latitude/longitude is not sent to the Pulse backend.

### Private text analytics

Admin-created response policy -> protected answer/comment storage -> server-side admin authorization -> restricted projection without author, vote choice, location, or exact timestamp -> analyst/B2B dashboard. Public APIs have no route that returns written response text.

### News

Approved source -> fetch -> normalize -> cluster duplicates -> generate draft summary -> attach evidence -> automated checks -> editorial decision -> publish -> rank.

### Moderation

Report -> triage -> case -> evidence -> action -> notification/appeal -> audit event.

## Security boundaries

- Votes are private records; only aggregates are public.
- Feed reports are private, blocks apply in both directions, and public feed author identity is limited to display name and handle.
- Admin roles use least privilege and step-up authentication for sensitive actions.
- Media is quarantined and scanned before publication.
- Message reads require conversation membership.
- A first message goes to Requests unless the recipient follows the sender.
  Only the requested recipient can accept or delete it; accepted conversations
  move into both users' main inboxes.
- Rate limits exist per account, device signal, IP range, and operation.
- Secrets never enter client bundles or repository history.

The development admin dashboard calls the API server-to-server with `ADMIN_API_KEY`; this is a bootstrap mechanism, not the production identity model. Production replaces it with organization SSO, least-privilege role bindings, step-up authentication, and immutable audit events.

## Official geography sources

- Election Commission of India, _Atlas of Lok Sabha Elections 2024_, “List of Parliamentary Constituencies” (pages 17–19).
- Rajya Sabha Secretariat, _Information at a Glance_ (Annexure I), state/UT seat allocation.

The seed is versioned because delimitation and state organization can change. Updates require a source review, effective date, count assertions (543 Lok Sabha constituencies and 233 elected Rajya Sabha seats for this version), and migration review.
