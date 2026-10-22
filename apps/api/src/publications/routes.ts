import type { FastifyInstance, FastifyRequest } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createPublicationSchema,
  publicationCategorySchema,
  publicationKindSchema,
} from "@pulse/contracts";
import type { PublicationRepository } from "./repository.js";
import { newsMediaKind } from "../ai-news/media-kind.js";

const userId = async (request: FastifyRequest) =>
  (await request.jwtVerify<{ sub: string }>()).sub;
export async function publicationRoutes(
  app: FastifyInstance,
  options: {
    repository: PublicationRepository;
    adminKey: string;
    userReels?: (
      userId: string,
    ) => Promise<import("@pulse/contracts").Publication[]>;
  },
) {
  const uploadDirectory = join(process.cwd(), "uploads", "publications");
  app.get("/publication-media/:name", async (request, reply) => {
    const name = String((request.params as { name: string }).name);
    if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp|mp4|mov|webm)$/i.test(name))
      return reply.code(404).send();
    try {
      const data = await readFile(join(uploadDirectory, name));
      const extension = extname(name).toLowerCase();
      return reply
        .type(
          extension === ".mp4"
            ? "video/mp4"
            : extension === ".webm"
              ? "video/webm"
              : extension === ".png"
                ? "image/png"
                : extension === ".webp"
                  ? "image/webp"
                  : "image/jpeg",
        )
        .send(data);
    } catch {
      return reply.code(404).send();
    }
  });
  app.get("/publications", async (request, reply) => {
    const viewerId = await userId(request);
    const query = request.query as { kind?: string; category?: string };
    const kind = publicationKindSchema.safeParse(query.kind);
    const category = query.category
      ? publicationCategorySchema.safeParse(query.category)
      : null;
    if (!kind.success || (category && !category.success))
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    const adminItems = await options.repository.list(
      kind.data,
      category?.success ? category.data : undefined,
    );
    const userItems =
      kind.data === "reel" && options.userReels
        ? await options.userReels(viewerId)
        : [];
    return {
      items: [...adminItems, ...userItems].sort((a, b) =>
        b.publishedAt.localeCompare(a.publishedAt),
      ),
    };
  });
  app.get("/admin/publications", async (request, reply) => {
    if (request.headers["x-pulse-admin-key"] !== options.adminKey)
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const query = request.query as { kind?: string };
    const kind = publicationKindSchema.safeParse(query.kind ?? "news");
    if (!kind.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    return { items: await options.repository.list(kind.data) };
  });
  app.patch("/admin/publications/:id", async (request, reply) => {
    if (request.headers["x-pulse-admin-key"] !== options.adminKey)
      return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    const id = z
      .string()
      .uuid()
      .safeParse((request.params as { id: string }).id);
    const body = z
      .object({
        category: publicationCategorySchema,
        mediaUrl: z
          .string()
          .refine(
            (value) =>
              value.startsWith("/v1/ai-news/media/") ||
              (z.url().safeParse(value).success &&
                value.startsWith("https://")),
          ),
        evidenceNote: z.string().trim().min(10).max(500),
        headline: z.string().trim().min(5).max(180).optional(),
        summary: z.string().trim().min(40).max(1200).optional(),
      })
      .safeParse(request.body);
    if (!id.success || !body.success)
      return reply.code(400).send({ error: "INVALID_PUBLICATION_UPDATE" });
    const updated = await options.repository.updateNews(id.data, {
      category: body.data.category,
      mediaUrl: body.data.mediaUrl,
      evidenceNote: body.data.evidenceNote,
      ...(body.data.headline ? { headline: body.data.headline } : {}),
      ...(body.data.summary ? { summary: body.data.summary } : {}),
      media: [
        { url: body.data.mediaUrl, kind: newsMediaKind(body.data.mediaUrl) },
      ],
    });
    return updated ?? reply.code(404).send({ error: "PUBLICATION_NOT_FOUND" });
  });
  app.post(
    "/admin/publications",
    { bodyLimit: 60 * 1024 * 1024 },
    async (request, reply) => {
      if (request.headers["x-pulse-admin-key"] !== options.adminKey)
        return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
      const parsed = createPublicationSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
      const uploaded = parsed.data.media ?? [];
      if (uploaded.length) await mkdir(uploadDirectory, { recursive: true });
      const media = await Promise.all(
        uploaded.map(async (item) => {
          const fallback = item.kind === "video" ? ".mp4" : ".jpg";
          const extension =
            extname(item.originalName).toLowerCase() || fallback;
          const name = `${randomUUID()}${extension}`;
          await writeFile(
            join(uploadDirectory, name),
            Buffer.from(item.base64, "base64"),
          );
          return {
            url: `/v1/publication-media/${name}`,
            kind: item.kind,
            mimeType: item.mimeType,
          };
        }),
      );
      const linkedMedia = [
        ...(parsed.data.mediaUrl ? [parsed.data.mediaUrl] : []),
        ...(parsed.data.mediaUrls ?? []),
      ].map((url) => ({
        url,
        kind: /\.(mp4|mov|webm)(\?|$)/i.test(url)
          ? ("video" as const)
          : ("image" as const),
        mimeType: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video/*" : "image/*",
      }));
      media.unshift(...linkedMedia);
      const {
        media: _uploads,
        mediaUrls: _mediaUrls,
        ...details
      } = parsed.data;
      return reply.code(201).send(
        await options.repository.create({
          ...details,
          mediaUrl: media[0]!.url,
          media,
        }),
      );
    },
  );
}
