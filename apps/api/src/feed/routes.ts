import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createFeedCommentSchema,
  createFeedPostSchema,
  createFeedReportSchema,
  createStorySchema,
  createStoryReplySchema,
  createLiveCommentSchema,
  createLiveSessionSchema,
  registerPushTokenSchema,
  updateProfileSchema,
  voteFeedPollSchema,
} from "@pulse/contracts";
import { FeedError, FeedService } from "./service.js";
import type { ChatService } from "../chat/service.js";

const userId = async (request: FastifyRequest) =>
  (await request.jwtVerify<{ sub: string }>()).sub;
const errorReply = (
  error: unknown,
  reply: { code(status: number): { send(value: unknown): unknown } },
) => {
  if (!(error instanceof FeedError)) throw error;
  const status =
    error.code === "POST_NOT_FOUND" ||
    error.code === "USER_NOT_FOUND" ||
    error.code === "STORY_NOT_FOUND" ||
    error.code === "COMMENT_NOT_FOUND"
      ? 404
      : error.code === "POST_OWNER_REQUIRED" ||
          error.code === "COMMENT_OWNER_REQUIRED" ||
          error.code === "STORY_OWNER_REQUIRED"
        ? 403
        : 400;
  return reply.code(status).send({ error: error.code });
};

export async function feedRoutes(
  app: FastifyInstance,
  options: { service: FeedService; chat?: ChatService },
) {
  app.get("/", async (request, reply) => {
    const query = request.query as { cursor?: string; limit?: string };
    const limit = Math.min(30, Math.max(1, Number(query.limit ?? 15) || 15));
    try {
      return await options.service.list(
        await userId(request),
        query.cursor,
        limit,
      );
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.get("/trending", async (request, reply) => {
    const query = request.query as { kind?: string; tag?: string };
    const kind =
      query.kind === "posts" || query.kind === "reels" ? query.kind : "all";
    return options.service.trending(await userId(request), kind, query.tag);
  });
  app.get("/search", async (request, reply) => {
    const query = request.query as { q?: string };
    return options.service.search(await userId(request), query.q ?? "");
  });
  app.post(
    "/posts",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = createFeedPostSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
      try {
        return reply
          .code(201)
          .send(
            await options.service.create(await userId(request), parsed.data),
          );
      } catch (error) {
        return errorReply(error, reply);
      }
    },
  );
  app.delete("/posts/:id", async (request, reply) => {
    try {
      await options.service.deletePost(
        (request.params as { id: string }).id,
        await userId(request),
      );
      return reply.code(204).send();
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.put("/posts/:id/like", async (request, reply) => {
    try {
      return await options.service.like(
        (request.params as { id: string }).id,
        await userId(request),
        true,
      );
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.put("/posts/:id/repost", async (request, reply) => {
    try {
      return await options.service.repost(
        (request.params as { id: string }).id,
        await userId(request),
        true,
      );
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.delete("/posts/:id/repost", async (request, reply) => {
    try {
      return await options.service.repost(
        (request.params as { id: string }).id,
        await userId(request),
        false,
      );
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.get("/posts/:id/comments", async (request, reply) => {
    try {
      return await options.service.comments(
        (request.params as { id: string }).id,
        await userId(request),
      );
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.delete("/posts/:postId/comments/:commentId", async (request, reply) => {
    const { postId, commentId } = request.params as {
      postId: string;
      commentId: string;
    };
    try {
      await options.service.deleteComment(
        postId,
        commentId,
        await userId(request),
      );
      return reply.code(204).send();
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.get("/media/:id", async (request, reply) => {
    const media = await options.service.media(
      (request.params as { id: string }).id,
    );
    if (!media) return reply.code(404).send({ error: "MEDIA_NOT_FOUND" });
    const bytes = Buffer.from(media.dataBase64, "base64");
    return reply
      .type(media.mimeType)
      .header("content-length", String(bytes.length))
      .send(bytes);
  });
  app.delete("/posts/:id/like", async (request, reply) => {
    try {
      return await options.service.like(
        (request.params as { id: string }).id,
        await userId(request),
        false,
      );
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.post(
    "/posts/:id/comments",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = createFeedCommentSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "INVALID_REQUEST" });
      try {
        return reply
          .code(201)
          .send(
            await options.service.comment(
              (request.params as { id: string }).id,
              await userId(request),
              parsed.data,
            ),
          );
      } catch (error) {
        return errorReply(error, reply);
      }
    },
  );
  app.post(
    "/posts/:id/reports",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = createFeedReportSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "INVALID_REQUEST" });
      try {
        await options.service.report(
          (request.params as { id: string }).id,
          await userId(request),
          parsed.data,
        );
        return reply.code(204).send();
      } catch (error) {
        return errorReply(error, reply);
      }
    },
  );
  app.put("/users/:id/follow", async (request, reply) => {
    try {
      await options.service.follow(
        await userId(request),
        (request.params as { id: string }).id,
        true,
      );
      return reply.code(204).send();
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.delete("/users/:id/follow", async (request, reply) => {
    try {
      await options.service.follow(
        await userId(request),
        (request.params as { id: string }).id,
        false,
      );
      return reply.code(204).send();
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.put("/users/:id/block", async (request, reply) => {
    try {
      await options.service.block(
        await userId(request),
        (request.params as { id: string }).id,
      );
      return reply.code(204).send();
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.get("/reels", async (request) => ({
    items: await options.service.reels(await userId(request)),
  }));
  app.get("/me/videos", async (request) => {
    const id = await userId(request);
    return { items: await options.service.profileVideos(id, id) };
  });
  app.get("/me/profile", async (request) => {
    const id = await userId(request);
    return options.service.profile(id, id);
  });
  app.put("/me/profile", async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
    try {
      return await options.service.updateProfile(
        await userId(request),
        parsed.data,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "USERNAME_TAKEN")
        return reply.code(409).send({ error: "USERNAME_TAKEN" });
      throw error;
    }
  });
  app.get("/users/:id/profile", async (request) =>
    options.service.profile(
      (request.params as { id: string }).id,
      await userId(request),
    ),
  );
  app.get("/users/:id/connections",async(request,reply)=>{await userId(request);const kind=(request.query as {kind?:string}).kind;if(kind!=="followers"&&kind!=="following")return reply.code(400).send({error:"INVALID_CONNECTION_KIND"});return {items:await options.service.connections((request.params as {id:string}).id,kind)};});
  app.get("/users/:id/avatar", async (request, reply) => {
    const media = await options.service.profileMedia(
      (request.params as { id: string }).id,
    );
    if (!media) return reply.code(404).send({ error: "MEDIA_NOT_FOUND" });
    return reply
      .type(media.mimeType)
      .send(Buffer.from(media.dataBase64, "base64"));
  });
  app.get("/stories", async (request) => ({
    items: await options.service.stories(await userId(request)),
  }));
  app.post(
    "/stories",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = createStorySchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
      return reply
        .code(201)
        .send(
          await options.service.createStory(await userId(request), parsed.data),
        );
    },
  );
  app.delete("/stories/:id", async (request, reply) => {
    try {
      await options.service.deleteStory(
        (request.params as { id: string }).id,
        await userId(request),
      );
      return reply.code(204).send();
    } catch (error) {
      return errorReply(error, reply);
    }
  });
  app.get("/stories/:id/media", async (request, reply) => {
    const media = await options.service.storyMedia(
      (request.params as { id: string }).id,
    );
    if (!media) return reply.code(404).send({ error: "MEDIA_NOT_FOUND" });
    const bytes = Buffer.from(media.dataBase64, "base64");
    return reply
      .type(media.mimeType)
      .header("content-length", String(bytes.length))
      .send(bytes);
  });
  app.put("/posts/:id/poll-vote", async (request, reply) => {
    const parsed = voteFeedPollSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    try {
      return await options.service.votePoll(
        (request.params as { id: string }).id,
        await userId(request),
        parsed.data,
      );
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "POLL_VOTE_FAILED",
      });
    }
  });
  app.put("/stories/:id/view", async (request, reply) => {
    try {
      await options.service.viewStory(
        (request.params as { id: string }).id,
        await userId(request),
      );
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "STORY_NOT_FOUND" });
    }
  });
  app.put("/stories/:id/like", async (request, reply) => {
    try {
      await options.service.likeStory(
        (request.params as { id: string }).id,
        await userId(request),
        true,
      );
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "STORY_NOT_FOUND" });
    }
  });
  app.delete("/stories/:id/like", async (request, reply) => {
    try {
      await options.service.likeStory(
        (request.params as { id: string }).id,
        await userId(request),
        false,
      );
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "STORY_NOT_FOUND" });
    }
  });
  app.post("/stories/:id/replies", async (request, reply) => {
    const parsed = createStoryReplySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    try {
      const senderId = await userId(request);
      const message = await options.service.replyStory(
        (request.params as { id: string }).id,
        senderId,
        parsed.data.body,
      );
      await options.chat?.send(senderId, message.recipient.id, {
        body: parsed.data.body,
      });
      return reply.code(201).send(message);
    } catch {
      return reply.code(404).send({ error: "STORY_NOT_FOUND" });
    }
  });
  app.get("/stories/:id/viewers", async (request, reply) => {
    try {
      return {
        items: await options.service.storyViewers(
          (request.params as { id: string }).id,
          await userId(request),
        ),
      };
    } catch {
      return reply.code(403).send({ error: "STORY_OWNER_REQUIRED" });
    }
  });
  app.get("/story-messages", async (request) => ({
    items: await options.service.storyMessages(await userId(request)),
  }));
  app.get("/live", async (request) => ({
    items: await options.service.liveSessions(await userId(request)),
  }));
  app.post("/live", async (request, reply) => {
    const parsed = createLiveSessionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    return reply
      .code(201)
      .send(
        await options.service.startLive(
          await userId(request),
          parsed.data.title,
        ),
      );
  });
  app.put("/live/:id/join", async (request, reply) => {
    await options.service.joinLive(
      (request.params as { id: string }).id,
      await userId(request),
      true,
    );
    return reply.code(204).send();
  });
  app.delete("/live/:id/join", async (request, reply) => {
    await options.service.joinLive(
      (request.params as { id: string }).id,
      await userId(request),
      false,
    );
    return reply.code(204).send();
  });
  app.put("/live/:id/end", async (request, reply) => {
    await options.service.endLive(
      (request.params as { id: string }).id,
      await userId(request),
    );
    return reply.code(204).send();
  });
  app.get("/live/:id/comments", async (request) => ({
    items: await options.service.liveComments(
      (request.params as { id: string }).id,
    ),
  }));
  app.post("/live/:id/comments", async (request, reply) => {
    const parsed = createLiveCommentSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    return reply
      .code(201)
      .send(
        await options.service.addLiveComment(
          (request.params as { id: string }).id,
          await userId(request),
          parsed.data.body,
        ),
      );
  });
  app.get("/notifications", async (request) => ({
    items: await options.service.notifications(await userId(request)),
  }));
  app.put("/notifications/read", async (request, reply) => {
    await options.service.readNotifications(await userId(request));
    return reply.code(204).send();
  });
  app.put("/notifications/:id/read", async (request, reply) => {
    await options.service.readNotifications(
      await userId(request),
      (request.params as { id: string }).id,
    );
    return reply.code(204).send();
  });
  app.get("/live/:id/credentials", async (request, reply) => {
    try {
      return await options.service.liveCredentials(
        (request.params as { id: string }).id,
        await userId(request),
      );
    } catch {
      return reply.code(404).send({ error: "LIVE_NOT_AVAILABLE" });
    }
  });
  app.put("/push-token", async (request, reply) => {
    const parsed = registerPushTokenSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_PUSH_TOKEN" });
    await options.service.registerPushToken(
      await userId(request),
      parsed.data.token,
      parsed.data.platform,
    );
    return reply.code(204).send();
  });
}
