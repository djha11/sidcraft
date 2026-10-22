import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config.js";
import {
  MemoryAuthRepository,
  type AuthRepository,
} from "./auth/repository.js";
import { AuthService } from "./auth/service.js";
import { ConsoleEmailSender, ResendEmailSender } from "./auth/email.js";
import { authRoutes } from "./auth/routes.js";
import {
  MemoryPollRepository,
  type PollRepository,
} from "./polls/repository.js";
import { PollService } from "./polls/service.js";
import { pollRoutes } from "./polls/routes.js";
import { adminPollRoutes } from "./polls/admin-routes.js";
import {
  MemoryLocationRepository,
  type LocationRepository,
} from "./geography/repository.js";
import { GeographyService } from "./geography/service.js";
import { geographyRoutes } from "./geography/routes.js";
import {
  MemoryFeedRepository,
  type FeedRepository,
} from "./feed/repository.js";
import { FeedService } from "./feed/service.js";
import { feedRoutes } from "./feed/routes.js";
import {
  MemoryPublicationRepository,
  type PublicationRepository,
} from "./publications/repository.js";
import { AccessToken } from "livekit-server-sdk";
import { publicationRoutes } from "./publications/routes.js";
import {
  MemoryChatRepository,
  type ChatRepository,
} from "./chat/repository.js";
import { ChatService } from "./chat/service.js";
import { chatRoutes } from "./chat/routes.js";
import { adminControlRoutes } from "./admin/routes.js";
import {
  MemoryAdminRepository,
  type AdminRepository,
} from "./admin/repository.js";
import {
  MemoryPreferencesRepository,
  type PreferencesRepository,
} from "./preferences/repository.js";
import { preferencesRoutes } from "./preferences/routes.js";
import { aiNewsRoutes } from "./ai-news/routes.js";
import {
  MemoryNewsAutomationRepository,
  type NewsAutomationRepository,
} from "./ai-news/repository.js";

export async function buildApp(
  config: AppConfig,
  repository: AuthRepository = new MemoryAuthRepository(),
  pollRepository: PollRepository = new MemoryPollRepository(),
  locationRepository: LocationRepository = new MemoryLocationRepository(),
  feedRepository: FeedRepository = new MemoryFeedRepository(),
  publicationRepository: PublicationRepository = new MemoryPublicationRepository(),
  chatRepository: ChatRepository = new MemoryChatRepository(),
  adminRepository: AdminRepository = new MemoryAdminRepository(),
  preferencesRepository: PreferencesRepository = new MemoryPreferencesRepository(),
  newsAutomationRepository: NewsAutomationRepository = new MemoryNewsAutomationRepository(),
) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    trustProxy: true,
    bodyLimit: 28_000_000,
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: config.NODE_ENV === "production" ? false : true,
    credentials: true,
  });
  await app.register(rateLimit, { global: false });
  await app.register(jwt, { secret: config.JWT_SECRET });
  app.get("/health", async () => ({ status: "ok", service: "pulse-api" }));
  await app.register(authRoutes, {
    prefix: "/v1/auth",
    service: new AuthService(
      repository,
      config.RESEND_API_KEY
        ? new ResendEmailSender(config.RESEND_API_KEY, config.EMAIL_FROM)
        : new ConsoleEmailSender(),
      config.JWT_SECRET,
      config.NODE_ENV !== "production",
    ),
  });
  await app.register(preferencesRoutes, {
    prefix: "/v1/me/preferences",
    repository: preferencesRepository,
  });
  const geography = new GeographyService(locationRepository);
  const polls = new PollService(pollRepository, (id) =>
    geography.audienceFor(id),
  );
  await app.register(geographyRoutes, { prefix: "/v1", service: geography });
  await app.register(pollRoutes, { prefix: "/v1/polls", service: polls });
  await app.register(adminPollRoutes, {
    prefix: "/v1/admin/polls",
    service: polls,
    adminKey: config.ADMIN_API_KEY,
  });
  const feed = new FeedService(
    feedRepository,
    async (id) => {
      const user = await repository.findById(id);
      return user
        ? { id: user.id, displayName: user.displayName, handle: user.handle }
        : null;
    },
    async (roomName, identity, canPublish) => {
      const token = new AccessToken(
        config.LIVEKIT_API_KEY,
        config.LIVEKIT_API_SECRET,
        { identity, ttl: "2h" },
      );
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish,
        canSubscribe: true,
      });
      return {
        serverUrl: config.LIVEKIT_PUBLIC_URL,
        token: await token.toJwt(),
      };
    },
    (id) => preferencesRepository.get(id),
  );
  const chat = new ChatService(
    chatRepository,
    async (id) => {
      const user = await repository.findById(id);
      return user
        ? { id: user.id, displayName: user.displayName, handle: user.handle }
        : null;
    },
    async (roomName, identity) => {
      const token = new AccessToken(
        config.LIVEKIT_API_KEY,
        config.LIVEKIT_API_SECRET,
        { identity, ttl: "2h" },
      );
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });
      return {
        serverUrl: config.LIVEKIT_PUBLIC_URL,
        token: await token.toJwt(),
      };
    },
    (id) => preferencesRepository.get(id),
  );
  await app.register(feedRoutes, {
    prefix: "/v1/feed",
    service: feed,
    chat,
  });
  await app.register(chatRoutes, {
    prefix: "/v1/chat",
    service: chat,
  });
  await app.register(publicationRoutes, {
    prefix: "/v1",
    repository: publicationRepository,
    adminKey: config.ADMIN_API_KEY,
    userReels: (id) => feed.reels(id),
  });
  await app.register(aiNewsRoutes, {
    prefix: "/v1",
    repository: newsAutomationRepository,
    publications: publicationRepository,
    admin: adminRepository,
    adminKey: config.ADMIN_API_KEY,
  });
  await app.register(adminControlRoutes, {
    prefix: "/v1",
    repository: adminRepository,
    adminKey: config.ADMIN_API_KEY,
  });
  return app;
}
