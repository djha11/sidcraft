import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { publicationCategorySchema } from "@pulse/contracts";
import type { NewsAutomationRepository } from "./repository.js";
import type { PublicationRepository } from "../publications/repository.js";
import type { AdminRepository } from "../admin/repository.js";
import { localModelStatus, prepareDraft } from "./draft.js";
import { cardPng } from "./card-image.js";
import { newsMediaKind } from "./media-kind.js";

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  feedUrl: z.string().url().startsWith("https://"),
  websiteUrl: z.string().url().nullable().default(null),
  category: publicationCategorySchema,
  enabled: z.boolean().default(true),
  pollingMinutes: z.number().int().min(2).max(1440).default(2),
});
const candidateSchema = z.object({
  sourceUrl: z.string().url().startsWith("https://"),
  originalHeadline: z.string().trim().min(5).max(500),
  description: z.string().trim().max(5000).default(""),
  suggestedMediaUrl: z
    .string()
    .url()
    .startsWith("https://")
    .nullable()
    .default(null),
  sourcePublishedAt: z.string().datetime().nullable().default(null),
});
const reviewSchema = z.object({
  finalHeadline: z.string().trim().min(5).max(180),
  finalSummary: z.string().trim().min(10).max(1200),
  mediaUrl: z
    .string()
    .refine(
      (value) =>
        value.startsWith("/v1/ai-news/media/") ||
        (z.url().safeParse(value).success && value.startsWith("https://")),
    ),
  mediaAttribution: z.string().trim().min(3).max(500),
});
const idSchema = z.object({ id: z.string().uuid() });

export async function aiNewsRoutes(
  app: FastifyInstance,
  options: {
    repository: NewsAutomationRepository;
    publications: PublicationRepository;
    admin: AdminRepository;
    adminKey: string;
  },
) {
  const authorized = (request: FastifyRequest) =>
    request.headers["x-pulse-admin-key"] === options.adminKey;
  app.get("/ai-news/media/:id", async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(404).send();
    const candidate = await options.repository.candidate(params.data.id);
    if (!candidate) return reply.code(404).send();
    return reply
      .header("Cache-Control", "public, max-age=86400")
      .type("image/png")
      .send(cardPng(candidate.category));
  });
  app.get("/admin/ai-news/control", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const setting = (await options.admin.settings()).find(
      (row) => row.key === "ai_news_ingestion",
    );
    return { paused: setting?.enabled === false };
  });
  app.get("/admin/ai-news/model-status", async (request, reply) =>
    authorized(request)
      ? localModelStatus()
      : reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" }),
  );
  app.put("/admin/ai-news/control", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const parsed = z.object({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_CONTROL" });
    await options.admin.setSetting(
      "ai_news_ingestion",
      !parsed.data.paused,
      null,
    );
    return { paused: parsed.data.paused };
  });
  app.get("/admin/ai-news/sources", async (request, reply) =>
    authorized(request)
      ? { items: await options.repository.sources() }
      : reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" }),
  );
  app.post("/admin/ai-news/sources", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const parsed = sourceSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "INVALID_SOURCE", issues: parsed.error.issues });
    try {
      return reply
        .code(201)
        .send(await options.repository.addSource(parsed.data));
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "SOURCE_EXISTS" || error.message.includes("unique"))
      )
        return reply.code(409).send({ error: "SOURCE_EXISTS" });
      throw error;
    }
  });
  app.patch("/admin/ai-news/sources/:id", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const params = idSchema.safeParse(request.params),
      body = sourceSchema.partial().safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: "INVALID_SOURCE" });
    const row = await options.repository.updateSource(
      params.data.id,
      body.data,
    );
    return row ?? reply.code(404).send({ error: "SOURCE_NOT_FOUND" });
  });
  app.get("/admin/ai-news", async (request, reply) =>
    authorized(request)
      ? { items: await options.repository.candidates() }
      : reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" }),
  );
  app.post(
    "/internal/ai-news/sources/:id/candidates",
    async (request, reply) => {
      if (!authorized(request))
        return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
      const params = idSchema.safeParse(request.params),
        body = candidateSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ error: "INVALID_CANDIDATE" });
      if (
        (await options.admin.settings()).some(
          (row) => row.key === "ai_news_ingestion" && !row.enabled,
        )
      )
        return reply.code(423).send({ error: "NEWS_INGESTION_PAUSED" });
      const source = await options.repository.source(params.data.id);
      if (!source || !source.enabled)
        return reply.code(404).send({ error: "SOURCE_NOT_FOUND" });
      const existing = await options.repository.candidateBySourceUrl(
        body.data.sourceUrl,
      );
      if (existing)
        return reply.code(200).send({ candidate: existing, created: false });
      const draft = await prepareDraft(
        body.data.originalHeadline,
        body.data.description,
        body.data.sourceUrl,
      );
      const result = await options.repository.ingest({
        sourceId: source.id,
        ...body.data,
        finalHeadline: draft.headline,
        finalSummary: draft.summary,
        draftMethod: draft.method,
      });
      if (result.created) {
        const sourceMedia = body.data.suggestedMediaUrl;
        const candidate = await options.repository.review(result.candidate.id, {
          finalHeadline: draft.headline,
          finalSummary: draft.summary,
          mediaUrl: sourceMedia ?? `/v1/ai-news/media/${result.candidate.id}`,
          mediaAttribution: sourceMedia
            ? `Publisher-supplied article media from ${source.name}; verify reuse rights before approval`
            : "Original SidCraft illustration; no source photo reused",
        });
        return reply.code(201).send({ candidate, created: true });
      }
      return reply.code(200).send(result);
    },
  );
  app.put("/internal/ai-news/sources/:id/fetch", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const params = idSchema.safeParse(request.params),
      body = z
        .object({ error: z.string().max(1000).nullable() })
        .safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    await options.repository.recordFetch(params.data.id, body.data.error);
    return reply.code(204).send();
  });
  app.patch("/admin/ai-news/:id", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const params = idSchema.safeParse(request.params),
      body = reviewSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: "INVALID_REVIEW" });
    const current = await options.repository.candidate(params.data.id);
    if (!current) return reply.code(404).send({ error: "CANDIDATE_NOT_FOUND" });
    if (current.status !== "needs_review")
      return reply.code(409).send({ error: "CANDIDATE_CLOSED" });
    return options.repository.review(params.data.id, body.data);
  });
  app.post("/admin/ai-news/:id/reject", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_ID" });
    const row = await options.repository.reject(params.data.id);
    return row ?? reply.code(404).send({ error: "CANDIDATE_NOT_FOUND" });
  });
  app.post("/admin/ai-news/:id/publish", async (request, reply) => {
    if (!authorized(request))
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_ID" });
    let row = await options.repository.candidate(params.data.id);
    if (!row) return reply.code(404).send({ error: "CANDIDATE_NOT_FOUND" });
    if (row.status !== "needs_review")
      return reply.code(409).send({ error: "CANDIDATE_CLOSED" });
    if (
      row.suggestedMediaUrl &&
      row.mediaUrl?.startsWith("/v1/ai-news/media/") &&
      row.finalHeadline &&
      row.finalSummary
    ) {
      row =
        (await options.repository.review(row.id, {
          finalHeadline: row.finalHeadline,
          finalSummary: row.finalSummary,
          mediaUrl: row.suggestedMediaUrl,
          mediaAttribution: `Publisher-supplied article media from ${row.sourceName}; verify reuse rights before approval`,
        })) ?? row;
    }
    if (
      !row.finalHeadline ||
      !row.finalSummary ||
      !row.mediaUrl ||
      !row.mediaAttribution
    )
      return reply
        .code(400)
        .send({ error: "REVIEW_AND_LICENSED_MEDIA_REQUIRED" });
    const reservation = await options.repository.reservePublication(row.id);
    if (reservation !== "reserved")
      return reply.code(409).send({
        error:
          reservation === "story_limit"
            ? "STORY_PUBLICATION_LIMIT"
            : "CANDIDATE_CLOSED",
      });
    let publication;
    try {
      publication = await options.publications.create({
        kind: "news",
        category: row.category,
        headline: row.finalHeadline,
        summary: row.finalSummary,
        mediaUrl: row.mediaUrl,
        media: [{ url: row.mediaUrl, kind: newsMediaKind(row.mediaUrl) }],
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl,
        evidenceNote:
          `Source: ${row.sourceUrl}. Media: ${row.mediaAttribution}`.slice(
            0,
            500,
          ),
      });
    } catch (error) {
      await options.repository.releasePublication(row.id);
      throw error;
    }
    const publishedCandidate = await options.repository.markPublished(
      row.id,
      publication.id,
    );
    if (!publishedCandidate)
      throw new Error("PUBLICATION_CREATED_CANDIDATE_FINALIZATION_REQUIRED");
    return reply.code(201).send(publication);
  });
}
