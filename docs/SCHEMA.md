# Initial data model

## Identity and graph

Implemented: `users`, `profiles`, `sessions`, `follows`, `user_blocks`. Planned extensions: `user_interests`, `devices`.

## Social

Implemented: `feed_posts`, `feed_post_media`, `feed_post_likes`, `feed_post_reposts`, `feed_post_comments`, `feed_post_reports`. Planned extensions: `bookmarks`, `hashtags`.

Feed polls use `feed_post_polls`, `feed_post_poll_options`, and `feed_post_poll_votes`. Polls support two to six unique options, single or multiple answers, and a bounded closing time. Public responses contain only aggregate option counts/percentages and the current viewer's own selection; they never expose another voter's identity or choice.

Feed posts and comments use explicit lifecycle status values. Likes and follows have composite primary keys, making repeated requests idempotent. Reports are unique per reporter and post, and report details are never returned from the public Feed API. Blocks suppress content in both directions and remove follow edges between the two accounts.

Anonymous posts omit the author from public API responses while retaining a protected owner reference for moderation and the future private Profile collection. Media supports up to four image, video, or document records per post at 20 MB each. Comments support one reply level through `parent_comment_id`; the API validates that the parent belongs to the same post.

The protected profile projection is assembled from profiles, feed posts, media, follows, reposts, and username mentions. Its public form never returns anonymous posts or an anonymous count. The owner projection includes those fields for the authenticated owner only; the public post count excludes anonymous posts and counts each public feed post once, including Reel posts.

Profiles persist optional bio and website fields plus an optional circular image or looping video avatar. Edited handles keep the same global uniqueness rule as signup. Avatar bytes are served through the authenticated profile-media endpoint.

## Polling

Implemented: `polls`, `poll_options`, `votes`. Planned extensions: `poll_eligibility`, `poll_result_snapshots`, `vote_risk_signals`.

The `votes` table has a unique constraint on `(poll_id, user_id)`. Choice IDs, private written answers, and private comments are stored only in this protected persistence boundary. Public poll DTOs contain none of the text fields.

Polls choose `choice` or `open_text`, a comment mode (`disabled`, `optional`, `required`), and an audience scope (`india`, `state`, `lok_sabha`). Database checks enforce target shape, schedule order, response shape, text length, and risk-score range.

## India geography

`india_regions`, `lok_sabha_constituencies`, `user_location_preferences`

- The checked-in seed contains 36 state/UT records and all 543 territorial Lok Sabha constituencies.
- Rajya Sabha is modeled as elected-seat allocation per state/UT, totaling 233, plus the separate constitutional category of 12 nominated members. It is not modeled as a direct voter constituency.
- Location preference stores state/UT and optionally a Lok Sabha constituency. Coordinates are intentionally absent from the schema.
- Source URLs and source-check timestamps are stored with official reference data.

## News

Implemented for the publishing slice: `publications`, with separate `news` and `reel` kinds, category, media URL, source name/link, evidence note, and publication timestamp. News cannot be created through the protected API without stored source attribution and an evidence note.

Planned editorial extensions: `news_sources`, `story_sources`, `story_evidence`, `story_clusters`, `editorial_decisions`, and `corrections`.

## User videos and stories

Every uploaded video stores `duration_seconds` and remains attached to its Feed post and the creator's Profile Videos collection. Videos from 1 through 180 seconds are additionally returned in the application-wide Reels stream. Longer videos are never promoted to Reels.

`stories` stores one image or video with a fixed 24-hour expiry. The story API returns the viewer's own active stories first, followed only by active stories belonging to profiles the viewer follows.

`story_views` and `story_likes` are unique per story/user. Viewer identities are available only to the story owner. `story_replies` delivers both text replies and heart reactions into the participants' Story Replies Chat inbox.

## Communication

`conversations` stores a unique two-user thread, its `requested`/`accepted`
state, and which recipient owns a pending request. `direct_messages` stores the
message history and read timestamps. Both are PostgreSQL-backed; membership and
request acceptance are enforced by the API before reads or writes.

## Safety and administration

Implemented for this slice: `analytics_access`, `feed_post_reports`, `user_blocks`. Planned: `moderation_cases`, `moderation_actions`, `fraud_cases`, organization role bindings, `audit_logs`, `feature_flags`.

## Analytics

`content_impressions`, `engagement_events`, `ranking_explanations`

Analytics events use pseudonymous identifiers and defined retention limits.

Restricted poll analytics omits author identifiers, vote choices, saved geography, and exact timestamps. The dashboard receives only anonymous answer/comment text and a calendar date. Production B2B exports must additionally pass retention, PII-redaction, contractual-purpose, and minimum-cohort policies.
