import type { FastifyInstance, FastifyRequest } from "fastify";
import { createPollRequestSchema } from "@pulse/contracts";
import { PollError, PollService } from "./service.js";

function authorized(request: FastifyRequest, key: string) { return request.headers["x-pulse-admin-key"] === key; }
export async function adminPollRoutes(app: FastifyInstance, options: { service: PollService; adminKey: string }) {
  app.addHook("preHandler", async (request, reply) => { if (!authorized(request, options.adminKey)) return reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" }); });
  app.get("/", async () => ({ items: await options.service.adminList() }));
  app.post("/", async (request, reply) => { const parsed = createPollRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", issues: parsed.error.issues }); try { return reply.code(201).send(await options.service.create(parsed.data, null)); } catch (error) { if (error instanceof PollError) return reply.code(400).send({ error: error.code }); throw error; } });
  app.get("/:id/analytics", async (request, reply) => { try { return await options.service.analytics((request.params as { id: string }).id); } catch (error) { if (error instanceof PollError) return reply.code(404).send({ error: error.code }); throw error; } });
}
