# Pulse news ingestion worker

This worker fetches only enabled HTTPS RSS/Atom sources configured in Admin → AI News. It stores source-linked candidates for human review; it does not generate unsupported facts or auto-publish. Run independently of the admin browser:

`ADMIN_API_KEY=... PULSE_API_URL=http://127.0.0.1:4000 pnpm --filter @pulse/ai-news-worker dev`

For a single pass use `pnpm --filter @pulse/ai-news-worker once`. Each source has a configurable polling interval. Failed sources are logged separately and do not stop other sources. Feed excerpts remain source-attributed; no publisher imagery is copied. An admin must supply a permitted media URL and attribution before publishing to the existing Pulse news format.
