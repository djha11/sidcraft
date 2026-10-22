import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const key = "development-admin-key-change-before-prod";
const adminHeaders = { "x-pulse-admin-key": key };

describe("AI news intake", () => {
  it("prepares source-linked drafts and original media, and requires admin approval before publication", async () => {
    app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars",
      }),
    );
    expect(
      (await app.inject({ method: "GET", url: "/v1/admin/ai-news" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/admin/ai-news/model-status",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/admin/ai-news/control",
          headers: adminHeaders,
        })
      ).json(),
    ).toEqual({ paused: false });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/admin/ai-news/control",
          headers: adminHeaders,
          payload: { paused: true },
        })
      ).json(),
    ).toEqual({ paused: true });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/admin/ai-news/control",
          headers: adminHeaders,
        })
      ).json(),
    ).toEqual({ paused: true });
    const sourceResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-news/sources",
      headers: adminHeaders,
      payload: {
        name: "Official Example",
        feedUrl: "https://example.org/rss.xml",
        websiteUrl: null,
        category: "world",
        enabled: true,
        pollingMinutes: 15,
      },
    });
    expect(sourceResponse.statusCode).toBe(201);
    const sourceId = sourceResponse.json().id as string;
    const updatedSource = await app.inject({
      method: "PATCH",
      url: `/v1/admin/ai-news/sources/${sourceId}`,
      headers: adminHeaders,
      payload: { category: "stocks", pollingMinutes: 2 },
    });
    expect(updatedSource.statusCode).toBe(200);
    expect(updatedSource.json()).toMatchObject({
      category: "stocks",
      pollingMinutes: 2,
    });
    const candidatePayload = {
      sourceUrl: "https://example.org/article-1",
      originalHeadline: "An official agency announces a new policy",
      description: "The agency announced a new policy on Monday.",
      suggestedMediaUrl: "https://example.org/press-photo.jpg",
      sourcePublishedAt: null,
    };
    const intake = `/v1/internal/ai-news/sources/${sourceId}/candidates`;
    expect(
      (
        await app.inject({
          method: "POST",
          url: intake,
          headers: adminHeaders,
          payload: candidatePayload,
        })
      ).statusCode,
    ).toBe(423);
    await app.inject({
      method: "PUT",
      url: "/v1/admin/ai-news/control",
      headers: adminHeaders,
      payload: { paused: false },
    });
    const first = await app.inject({
      method: "POST",
      url: intake,
      headers: adminHeaders,
      payload: candidatePayload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().candidate.category).toBe("stocks");
    expect(
      (
        await app.inject({
          method: "POST",
          url: intake,
          headers: adminHeaders,
          payload: candidatePayload,
        })
      ).statusCode,
    ).toBe(200);
    const candidateId = first.json().candidate.id as string;
    expect(first.json().candidate).toMatchObject({
      finalHeadline: candidatePayload.originalHeadline,
      finalSummary: candidatePayload.description,
      draftMethod: "source_excerpt",
      mediaUrl: "https://example.org/press-photo.jpg",
      mediaAttribution:
        "Publisher-supplied article media from Official Example; verify reuse rights before approval",
      suggestedMediaUrl: "https://example.org/press-photo.jpg",
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/admin/ai-news/${candidateId}/publish`,
          headers: adminHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/admin/ai-news/${candidateId}`,
          headers: adminHeaders,
          payload: {
            finalHeadline: "Agency announces a new policy",
            finalSummary:
              "The agency announced a new policy on Monday, according to its public statement.",
            mediaUrl: "https://example.org/licensed-image.jpg",
            mediaAttribution: "Public domain image by Official Example",
          },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/admin/ai-news/${candidateId}/publish`,
          headers: adminHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    const publications = await app.inject({
      method: "GET",
      url: "/v1/admin/publications?kind=news",
      headers: adminHeaders,
    });
    expect(publications.json().items).toHaveLength(1);
    expect(publications.json().items[0]).toMatchObject({
      headline: candidatePayload.originalHeadline,
      sourceUrl: candidatePayload.sourceUrl,
    });
    const videoCandidate = await app.inject({
      method: "POST",
      url: intake,
      headers: adminHeaders,
      payload: {
        sourceUrl: "https://example.org/article-video",
        originalHeadline: "Markets close higher after policy announcement",
        description: "The agency reported a market update on Tuesday.",
        sourcePublishedAt: null,
      },
    });
    const videoId = videoCandidate.json().candidate.id as string;
    const videoReview = await app.inject({
      method: "PATCH",
      url: `/v1/admin/ai-news/${videoId}`,
      headers: adminHeaders,
      payload: {
        finalHeadline: "Markets close higher after policy announcement",
        finalSummary: "The agency reported a market update on Tuesday.",
        mediaUrl: "https://example.org/licensed-clip.mp4",
        mediaAttribution: "Licensed video by Official Example",
      },
    });
    expect(videoReview.statusCode).toBe(200);
    const videoPublished = await app.inject({
      method: "POST",
      url: `/v1/admin/ai-news/${videoId}/publish`,
      headers: adminHeaders,
      payload: {},
    });
    expect(videoPublished.statusCode).toBe(201);
    expect(videoPublished.json()).toMatchObject({
      category: "stocks",
      media: [{ kind: "video", url: "https://example.org/licensed-clip.mp4" }],
    });
    const revised = await app.inject({
      method: "PATCH",
      url: `/v1/admin/publications/${videoPublished.json().id}`,
      headers: adminHeaders,
      payload: {
        category: "sports",
        mediaUrl: "https://example.org/licensed-photo.jpg",
        evidenceNote:
          "Source: https://example.org/article-video. Media: licensed photo by Official Example.",
      },
    });
    expect(revised.statusCode).toBe(200);
    expect(revised.json()).toMatchObject({
      category: "sports",
      sourceUrl: "https://example.org/article-video",
      media: [{ kind: "image", url: "https://example.org/licensed-photo.jpg" }],
    });
    const email = "news-reader@example.com";
    const otp = (
      await app.inject({
        method: "POST",
        url: "/v1/auth/otp",
        payload: { email, purpose: "signup" },
      })
    ).json().developmentOtp;
    const reader = (
      await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          displayName: "News Reader",
          password: "correct horse battery staple",
          acceptedTerms: true,
          otp,
        },
      })
    ).json();
    const mobileFeed = await app.inject({
      method: "GET",
      url: "/v1/publications?kind=news",
      headers: { authorization: `Bearer ${reader.accessToken}` },
    });
    expect(mobileFeed.statusCode).toBe(200);
    expect(mobileFeed.json().items).toHaveLength(2);
  });
  it("groups matching reports from different sources and blocks a third publication", async () => {
    app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars",
      }),
    );
    const sources: string[] = [];
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/admin/ai-news/sources",
        headers: adminHeaders,
        payload: {
          name,
          feedUrl: `https://${name.toLowerCase()}.example.com/rss`,
          websiteUrl: null,
          category: name === "Beta" ? "politics" : "world",
          enabled: true,
          pollingMinutes: 15,
        },
      });
      sources.push(response.json().id);
    }
    const ids: string[] = [];
    for (const [index, sourceId] of sources.entries()) {
      const result = await app.inject({
        method: "POST",
        url: `/v1/internal/ai-news/sources/${sourceId}/candidates`,
        headers: adminHeaders,
        payload: {
          sourceUrl: `https://example.com/${index}`,
          originalHeadline: `${["Agency", "Official agency", "The agency"][index]} announces major public transport policy for city`,
          description:
            "The city agency announced a public transport policy on Monday.",
          sourcePublishedAt: null,
        },
      });
      ids.push(result.json().candidate.id);
    }
    const rows = (
      await app.inject({
        method: "GET",
        url: "/v1/admin/ai-news",
        headers: adminHeaders,
      })
    ).json().items;
    expect(
      new Set(rows.map((row: { storyId: string }) => row.storyId)).size,
    ).toBe(1);
    for (const [index, id] of ids.entries()) {
      const result = await app.inject({
        method: "POST",
        url: `/v1/admin/ai-news/${id}/publish`,
        headers: adminHeaders,
        payload: {},
      });
      expect(result.statusCode).toBe(index < 2 ? 201 : 409);
      if (index === 2)
        expect(result.json().error).toBe("STORY_PUBLICATION_LIMIT");
    }
  });
});
