FROM node:24-alpine AS base
# Pin pnpm to match CI (.github/workflows/ci.yml uses pnpm 9). pnpm 10.x enforces
# strict build-script approval by default and fails on @sentry/cli / esbuild /
# sharp build scripts. Keeping Docker and CI on the same major version means
# what passes 282 tests in CI also builds in the container. Upgrade plan: bump
# CI + this pin + add pnpm.onlyBuiltDependencies to root package.json in one
# coordinated commit.
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib ./lib
COPY artifacts/api-server/package.json ./artifacts/api-server/
RUN pnpm install --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY . .
RUN cd artifacts/api-server && npx tsx build.ts

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/eej-mobile-HIDDEN/dist ./eej-mobile-HIDDEN/dist
COPY --from=builder /app/artifacts/eej-mobile/dist ./artifacts/eej-mobile/dist
COPY --from=builder /app/artifacts/apatris-dashboard/dist ./artifacts/apatris-dashboard/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
EXPOSE 8080
CMD ["node", "artifacts/api-server/dist/index.cjs"]
