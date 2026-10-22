# Product requirements

## Vision

Project Pulse is a global social-opinion platform where people answer relevant polls, discuss issues, and consume concise source-backed news. Its differentiator is the connection between public conversation, transparent polling, and explainable news verification.

## MVP outcomes

1. A new user selects interests and reaches useful content quickly.
2. A user answers a personalized poll and immediately understands the aggregate result.
3. A user publishes or responds to a social post.
4. A user swipes through one concise news story at a time and can inspect its evidence.
5. Moderators can review users, posts, polls, news, reports, and risk signals with an audit trail.

## MVP surfaces

- Authentication and onboarding
- Pulse: personalized polls and results
- Feed: posts, replies, reactions, follows, bookmarks
- News: category stacks, one story per viewport, evidence, full coverage
- Search and discovery
- Profile, followers, following, notifications
- Admin moderation, poll operations, news review, fraud review, audit logs

## Non-goals for first release

- Public demographic micro-segments
- Fully autonomous AI fact verification
- Paid creator economy
- Complex ML recommendations
- Microservice infrastructure

## Trust requirements

- One active vote per eligible account per poll.
- Results appear after voting, unless the poll is explicitly configured otherwise.
- Public result slices require a privacy threshold.
- Verification labels describe evidence level; they are not a universal truth guarantee.
- Material admin actions require actor, reason, timestamp, and immutable audit entry.
- Users can report, mute, and block.
- Device location is opt-in, used only after an explicit action, and represented server-side as a coarse civic area.
- Written answers and vote comments never appear in the public application; restricted analytics excludes identity, choice, precise location, and exact time.
- Poll administrators decide response type and whether comments are disabled, optional, or required.

## MVP acceptance criteria

- Core mobile journeys work at 360px width.
- Keyboard and screen-reader labels cover primary actions.
- Vote writes are atomic and duplicate-safe.
- Authorization tests cover private messages and admin actions.
- News evidence links are stored independently from generated summaries.
- CI passes lint, typecheck, unit, integration, and production build checks.
