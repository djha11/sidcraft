import type { FastifyInstance, FastifyRequest } from "fastify";
import { updateUserPreferencesSchema } from "@pulse/contracts";
import type { PreferencesRepository } from "./repository.js";

const userId = async (request: FastifyRequest) =>
  (await request.jwtVerify<{ sub: string }>()).sub;

export async function preferencesRoutes(
  app: FastifyInstance,
  options: { repository: PreferencesRepository },
) {
  app.get("/", async (request) =>
    options.repository.get(await userId(request)),
  );
  app.patch("/", async (request, reply) => {
    const parsed = updateUserPreferencesSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "INVALID_PREFERENCES", issues: parsed.error.issues });
    return options.repository.update(await userId(request), parsed.data);
  });
}
