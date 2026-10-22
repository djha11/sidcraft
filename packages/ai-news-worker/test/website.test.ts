import { describe, expect, it } from "vitest";
import {
  discoverArticleUrls,
  parseArticlePage,
  robotsAllows,
} from "../src/website.js";

describe("website intake", () => {
  const site = new URL("https://news.example.org/");
  it("discovers only same-site article links", () => {
    const html =
      '<a href="/news/2026/story-one">One</a><a href="https://other.example.org/news/story-two">Other</a><a href="/about">About</a>';
    expect(discoverArticleUrls(html, site)).toEqual([
      "https://news.example.org/news/2026/story-one",
    ]);
  });
  it("extracts headline, article paragraphs, source URL, and suggested image", () => {
    const html =
      '<html><head><meta content="Space agency launches new mission" property="og:title"><meta property="og:image" content="https://media.example.org/photo.jpg"><meta property="article:published_time" content="2026-09-21T12:00:00Z"></head><body><article><h1>Space agency launches new mission</h1><p>The agency announced a new mission to study Earth on Monday.</p><p>Officials said the spacecraft will launch later this year.</p></article></body></html>';
    expect(
      parseArticlePage(html, new URL("https://news.example.org/news/mission")),
    ).toMatchObject({
      originalHeadline: "Space agency launches new mission",
      description:
        "The agency announced a new mission to study Earth on Monday. Officials said the spacecraft will launch later this year.",
      sourceUrl: "https://news.example.org/news/mission",
      suggestedMediaUrl: "https://media.example.org/photo.jpg",
      sourcePublishedAt: "2026-09-21T12:00:00.000Z",
    });
  });
  it("honors robots disallow with a more specific allow", () => {
    const robots =
      "User-agent: *\nDisallow: /news/private\nAllow: /news/private/public";
    expect(robotsAllows(robots, "/news/private/draft")).toBe(false);
    expect(robotsAllows(robots, "/news/private/public/story")).toBe(true);
  });
});
