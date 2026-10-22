import type { FastifyInstance, FastifyRequest } from "fastify";
import { locationPreferenceSchema } from "@pulse/contracts";
import { GeographyError, GeographyService } from "./service.js";
const userId = async (request: FastifyRequest) => (await request.jwtVerify<{ sub: string }>()).sub;
export async function geographyRoutes(app: FastifyInstance, options: { service: GeographyService }) {
  app.get("/geography/regions", async () => options.service.regions());
  app.get("/geography/constituencies", async () => options.service.allConstituencies());
  app.get("/geography/regions/:stateCode/constituencies", async (request, reply) => { try { return options.service.constituencies((request.params as { stateCode: string }).stateCode.toUpperCase()); } catch (error) { if (error instanceof GeographyError) return reply.code(404).send({ error: error.code }); throw error; } });
  app.get("/me/location", async (request, reply) => { try { return await options.service.get(await userId(request)); } catch (error) { if (error instanceof GeographyError) return reply.code(404).send({ error: error.code }); throw error; } });
  app.put("/me/location", async (request, reply) => { const parsed = locationPreferenceSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" }); try { return await options.service.save(await userId(request), parsed.data); } catch (error) { if (error instanceof GeographyError) return reply.code(400).send({ error: error.code }); throw error; } });
}
