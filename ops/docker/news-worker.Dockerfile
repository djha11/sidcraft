FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/ai-news-worker/package.json packages/ai-news-worker/package.json
RUN pnpm install --frozen-lockfile
COPY packages/ai-news-worker packages/ai-news-worker
RUN pnpm --filter @pulse/ai-news-worker build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/packages/ai-news-worker/dist packages/ai-news-worker/dist
ENV NODE_ENV=production
CMD ["node", "packages/ai-news-worker/dist/main.js"]
