FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/admin apps/admin
COPY packages/contracts packages/contracts
RUN pnpm --filter @pulse/admin build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 10000
CMD ["sh", "-c", "pnpm --filter @pulse/admin exec next start -p ${PORT:-10000}"]
