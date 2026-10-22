import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendDirectMessageSchema } from "@pulse/contracts";
import type { ChatService } from "./service.js";
const userId = async (request: FastifyRequest) =>
  (await request.jwtVerify<{ sub: string }>()).sub;
const fail = (
  error: unknown,
  reply: { code(n: number): { send(v: unknown): unknown } },
) => {
  const code = error instanceof Error ? error.message : "CHAT_FAILED";
  const status = code.includes("NOT_FOUND")
    ? 404
    : code.includes("REQUIRED") || code === "MESSAGE_REQUEST_NOT_ACCEPTED"
      ? 403
      : 400;
  return reply.code(status).send({ error: code });
};
export async function chatRoutes(
  app: FastifyInstance,
  options: { service: ChatService },
) {
  app.get("/conversations", async (request) => ({
    items: await options.service.inbox(
      await userId(request),
      (request.query as { requested?: string }).requested === "true",
    ),
  }));
  app.get("/users", async (request) => ({
    items: await options.service.search(
      await userId(request),
      (request.query as { q?: string }).q?.trim() ?? "",
    ),
  }));
  app.get("/conversations/:id/messages", async (request, reply) => {
    try {
      return {
        items: await options.service.messages(
          (request.params as { id: string }).id,
          await userId(request),
        ),
      };
    } catch (e) {
      return fail(e, reply);
    }
  });
  app.post("/conversations/:id/call-credentials", async (request, reply) => {
    try {
      return await options.service.callCredentials(
        (request.params as { id: string }).id,
        await userId(request),
      );
    } catch (e) {
      return fail(e, reply);
    }
  });
  app.post("/messages", async (request, reply) => {
    const parsed = sendDirectMessageSchema.safeParse(request.body);
    if (!parsed.success || !parsed.data.recipientId)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    try {
      return reply
        .code(201)
        .send(
          await options.service.send(
            await userId(request),
            parsed.data.recipientId,
            parsed.data,
          ),
        );
    } catch (e) {
      return fail(e, reply);
    }
  });
  app.post("/conversations/:id/messages", async (request, reply) => {
    const parsed = sendDirectMessageSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    try {
      const id = (request.params as { id: string }).id;
      const conversations = [
        ...(await options.service.inbox(await userId(request), false)),
        ...(await options.service.inbox(await userId(request), true)),
      ];
      const c = conversations.find((x) => x.id === id);
      if (!c) return reply.code(404).send({ error: "CONVERSATION_NOT_FOUND" });
      return reply
        .code(201)
        .send(
          await options.service.send(
            await userId(request),
            c.otherUser.id,
            parsed.data,
          ),
        );
    } catch (e) {
      return fail(e, reply);
    }
  });
  app.put("/conversations/:id/accept", async (request, reply) => {
    try {
      await options.service.accept(
        (request.params as { id: string }).id,
        await userId(request),
      );
      return reply.code(204).send();
    } catch (e) {
      return fail(e, reply);
    }
  });
  app.get("/messages/:id/media", async (request, reply) => {
    try {
      const media = await options.service.media(
        (request.params as { id: string }).id,
        await userId(request),
      );
      if (!media) return reply.code(404).send({ error: "MEDIA_NOT_FOUND" });
      return reply
        .type(media.mimeType)
        .send(Buffer.from(media.dataBase64, "base64"));
    } catch (e) {
      return fail(e, reply);
    }
  });
  app.delete("/conversations/:id", async (request, reply) => {
    try {
      await options.service.decline(
        (request.params as { id: string }).id,
        await userId(request),
      );
      return reply.code(204).send();
    } catch (e) {
      return fail(e, reply);
    }
  });
}
