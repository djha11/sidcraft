# Trending on Pulse

Trending is calculated on the server from posts visible to the signed-in viewer, so blocked and reported accounts remain excluded. Recent engagement is ranked with a time-decay score; likes, comments, and reposts contribute to ranking. Hashtags are extracted case-insensitively from post text.

The Feed shows a compact topic preview. **See all** opens the full Trending screen, where people can switch between all content, posts, and reels and filter by any currently trending hashtag. The endpoint is `GET /v1/feed/trending` with optional `kind` and `tag` query parameters.
