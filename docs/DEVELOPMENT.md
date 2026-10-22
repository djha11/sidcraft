# Development status

## Implemented foundation

- pnpm/Turborepo workspace
- Expo Router mobile application shell
- Next.js admin operations shell
- Fastify API with security headers, CORS, rate limits, and JWT signing
- Shared Zod authentication contracts
- Drizzle/PostgreSQL identity, profile, session, and follow schema
- Database-backed production authentication repository
- In-memory repository for isolated API tests
- Registration and login integration tests
- Rotating 30-day refresh sessions with one-time token rotation, family revocation on reuse, and logout revocation
- Secure mobile refresh-token storage with automatic startup rotation
- Mobile registration and login screens connected to the API
- Persistent mobile navigation for Pulse, Feed, News, Chat, Search, and Profile; unfinished destinations are clearly labelled product previews until their vertical API slices are implemented
- Database-backed social Feed with text/image/video/document publishing, optional public anonymity, cursor pagination, likes, reposts, native sharing, threaded comments/replies, follow/unfollow, private reporting, author blocking, pull-to-refresh, and infinite scrolling
- Feed media is PostgreSQL-backed for the self-contained local stack; production should move binary payloads to scanned object storage while retaining database metadata and authorization
- Feed responses expose only public profile identity and never include email addresses, poll votes, private answers, location preferences, or report details
- Database-backed News and Reels publication pipeline with protected admin publishing, mandatory source/evidence metadata, category filtering, Inshorts-style News paging, and Instagram-style vertical Reel playback
- Feed publishing moved from the timeline header into a bottom-right floating composer
- User video uploads are always saved to Feed and Profile Videos; uploads up to and including 180 seconds additionally enter the public Reels stream
- Instagram-style profiles expose public Posts, Reels, Reposts, and Tagged collections with follower/following counts. The Anonymous collection and anonymous count are owner-only; profile creation actions reuse the existing post, story/highlight, camera/media, and Live workflows.
- Edit Profile supports display name, availability-checked username changes, optional bio/website, and image or looping-video avatars. The avatar editor supports drag positioning, pinch and button zoom, reset, and persisted crop transforms. Selecting a profile tile opens its collection at that item with vertical paging through subsequent content.
- Instagram-style 24-hour Stories tray with the viewer's add action first and followed-profile stories after it
- Feed polls with 2–6 options, single/multiple-choice voting, selectable 1-hour/24-hour/7-day duration, live aggregate results, and no public voter identity
- Story view receipts, owner-only viewer/like lists, heart reactions, and text replies delivered into the Chat tab
- Story creation chooser with Camera photo/video capture, Media library selection, and Go Live entry
- Database-backed Live sessions, follower-only Live discovery rings, follower Live-start notifications, viewer presence, and floating Live comments kept separate from Direct Messages
- In-app notification inbox for follows/follow-backs, post likes/comments, mentions, and followed-account Live events, with unread state and mark-read controls
- LiveKit WebRTC transport with server-minted two-hour room tokens, host-only publish grants, follower subscribe grants, camera/microphone publishing, remote video rendering, and a local Docker media server
- Expo Notifications device registration and server delivery for social activity; Android FCM and iOS APNs production credentials are supplied through EAS without entering secrets in the mobile bundle
- Active poll, option, and private vote schema with a unique `(poll_id, user_id)` constraint
- Authenticated featured-poll and vote endpoints
- Results hidden until the viewer votes; individual votes never appear in API responses
- Poll tests covering authentication, result visibility, and duplicate-vote rejection
- ECI-aligned reference seed for all 543 Lok Sabha constituencies across 36 states/UTs
- Rajya Sabha state/UT allocation model for 233 elected seats; Rajya Sabha is deliberately not represented as direct voter constituencies
- Consent-based state location and optional Lok Sabha constituency preference; precise device coordinates are not sent to the API
- Poll targeting at India, state/UT, and Lok Sabha constituency specificity
- Admin-selectable choice or private written-answer polls and disabled/optional/required vote comments
- Public response DTOs that never include written answers or comments
- Protected analytics response that omits user identity, vote choice, location, and exact timestamps
- Functional admin poll builder and private-text analytics dashboard
- PostgreSQL migration and idempotent official geography seed command
- API integration tests covering all 543 constituencies, 233 Rajya Sabha allocations, targeting, admin authorization, comment controls, and text non-disclosure
- PostgreSQL and Redis development containers

## Next vertical slice

1. Replace the server-to-server development admin key with organization SSO, role bindings, and step-up authentication.
2. Add a licensed constituency-boundary provider so exact PC resolution can happen without manual refinement.
3. Add retention jobs and PII redaction for analyst-visible written text before B2B exports.
4. Add email verification/password reset and production-grade media upload/scanning for social posts.
5. Add CI and a staging deployment.

## Definition of done

Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Android export is the default local mobile build; iOS builds should run in EAS or a macOS CI worker.
