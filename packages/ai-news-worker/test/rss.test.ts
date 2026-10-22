import { describe, expect, it } from "vitest";
import { parseRss } from "../src/rss.js";
import { publicAddress } from "../src/network.js";

describe("RSS intake", () => {
  it("accepts public NASA hosting while rejecting the reserved 192.0.0.0/24 range", () => {
    expect(publicAddress("192.0.66.108")).toBe(true);
    expect(publicAddress("192.0.0.8")).toBe(false);
    expect(publicAddress("127.0.0.1")).toBe(false);
  });
  it("reads source-linked titles and strips tracking parameters", () => {
    const items = parseRss(
      "<rss><channel><item><title>Public policy announced</title><link>https://example.org/story?utm_source=rss&amp;page=1</link><description><![CDATA[<p>Official statement released.</p>]]></description><pubDate>Tue, 15 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>",
    );
    expect(items).toEqual([
      {
        sourceUrl: "https://example.org/story?page=1",
        originalHeadline: "Public policy announced",
        description: "Official statement released.",
        suggestedMediaUrl: null,
        sourcePublishedAt: "2026-09-15T10:00:00.000Z",
      },
    ]);
  });
  it("suggests HTTPS image and video enclosures without treating audio as cover art", () => {
    const items = parseRss(
      '<rss><channel><item><title>Space mission prepares for launch</title><link>https://example.org/story</link><enclosure url="https://media.example.org/launch.mp4" type="video/mp4" /></item><item><title>Another mission update arrives</title><link>https://example.org/other</link><enclosure url="https://media.example.org/sound.mp3" type="audio/mpeg" /><media:thumbnail url="https://media.example.org/photo.jpg" /></item></channel></rss>',
    );
    expect(items.map((item) => item.suggestedMediaUrl)).toEqual([
      "https://media.example.org/launch.mp4",
      "https://media.example.org/photo.jpg",
    ]);
  });
  it("rejects malformed feeds and drops unusable articles", () => {
    expect(() => parseRss("not a feed")).toThrow("UNSUPPORTED_FEED");
    expect(
      parseRss("<rss><item><title>Article with no link</title></item></rss>"),
    ).toEqual([]);
  });
});
