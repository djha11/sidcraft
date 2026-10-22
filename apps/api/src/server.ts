import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "@pulse/database";
import { DrizzleAuthRepository } from "./auth/drizzle-repository.js";
import { DrizzlePollRepository } from "./polls/drizzle-repository.js";
import { DrizzleLocationRepository } from "./geography/repository.js";
import { DrizzleFeedRepository } from "./feed/drizzle-repository.js";
import { DrizzlePublicationRepository } from "./publications/drizzle-repository.js";
import { DrizzleChatRepository } from "./chat/drizzle-repository.js";
import { DrizzleAdminRepository } from "./admin/repository.js";
import { DrizzlePreferencesRepository } from "./preferences/repository.js";
import { DrizzleNewsAutomationRepository } from "./ai-news/repository.js";
const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
const app = await buildApp(
  config,
  new DrizzleAuthRepository(database.db),
  new DrizzlePollRepository(database.db),
  new DrizzleLocationRepository(database.db),
  new DrizzleFeedRepository(database.db),
  new DrizzlePublicationRepository(database.db),
  new DrizzleChatRepository(database.db),
  new DrizzleAdminRepository(database.db),
  new DrizzlePreferencesRepository(database.db),
  new DrizzleNewsAutomationRepository(database.db),
);
app.addHook("onClose", async () => database.close());
await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
