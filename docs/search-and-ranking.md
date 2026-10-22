# Search and personalized ranking

## Search

Authenticated users can search people by display name or username and search visible posts, reels, and hashtags by text. Results never reveal an anonymous post's author. Content hidden by blocks or the viewer's reports is excluded. The API is `GET /v1/feed/search?q=...` and waits for at least two characters.

## Feed and Reels ranking

Ranking uses data already created by normal product actions; it does not add background surveillance. The score combines:

- followed-creator affinity;
- topic terms learned from posts the viewer liked, commented on, or reposted;
- aggregate likes, comments, and reposts as a quality signal;
- recency with time decay;
- a small penalty for the viewer's own content to improve discovery.

Feed pagination still advances by the oldest timestamp in each candidate page, preventing ranked items from being skipped. Reels use topic affinity and freshness. Blocked and privately reported creators/content are excluded before ranking.

This is a deterministic initial recommender. Future ranking changes should remain explainable, avoid sensitive demographic inference, and be evaluated for diversity and creator concentration before release.
