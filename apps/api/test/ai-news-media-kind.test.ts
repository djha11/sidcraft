import { describe, expect, it } from "vitest";
import { newsMediaKind } from "../src/ai-news/media-kind.js";

describe("newsMediaKind", () => {
  it("recognizes direct video links even with query strings", () => {
    expect(newsMediaKind("https://media.example/news.mp4?token=abc")).toBe(
      "video",
    );
    expect(newsMediaKind("https://media.example/news.webm")).toBe("video");
  });
  it("keeps images and Pulse fallback artwork as images", () => {
    expect(newsMediaKind("https://media.example/photo.jpg")).toBe("image");
    expect(newsMediaKind("/v1/ai-news/media/example-id")).toBe("image");
  });
});
