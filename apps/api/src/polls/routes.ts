import type { FastifyInstance, FastifyRequest } from "fastify";
import { voteRequestSchema } from "@pulse/contracts";
import { PollError, PollService } from "./service.js";
const userId = async (request: FastifyRequest) => (await request.jwtVerify<{ sub: string }>()).sub;
export async function pollRoutes(app: FastifyInstance, options: { service: PollService }) {
  app.get("/featured", async (request, reply) => { try { return await options.service.featured(await userId(request)); } catch (error) { if (error instanceof PollError) return reply.code(404).send({ error: error.code }); throw error; } });
  app.get("/:id", async (request, reply) => { const { id } = request.params as { id: string }; try { return await options.service.get(id, await userId(request)); } catch (error) { if (error instanceof PollError) return reply.code(404).send({ error: error.code }); throw error; } });
  app.post("/:id/votes", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => { const parsed = voteRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" }); const { id } = request.params as { id: string }; try { return reply.code(201).send(await options.service.vote(id, parsed.data, await userId(request))); } catch (error) { if (error instanceof PollError) return reply.code(error.code === "DUPLICATE_VOTE" ? 409 : error.code === "POLL_NOT_FOUND" ? 404 : 400).send({ error: error.code }); throw error; } });
}
