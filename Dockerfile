# Piramida — one Dockerfile, two images:
#   docker build --target api -t piramida-api .
#   docker build --target web -t piramida-web --build-arg VITE_SITE_URL=https://club.example .
# (docker-compose.yaml builds both; see the README.)

ARG NODE_IMAGE=node:26.11.1-alpine3.24

# ---------------------------------------------------------------- shared base
FROM ${NODE_IMAGE} AS base
# Node 26 ships no corepack: install exactly the pnpm package.json declares
RUN npm install --global pnpm@12.10.1 && npm cache clean --force
WORKDIR /repo
# Manifests only, so the dependency layers below are cached until one changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# ------------------------------------------------------------------------ API
FROM base AS api-deps
RUN pnpm install --frozen-lockfile --prod --filter "@repo/api..."

# The API runs its TypeScript directly (Node's type stripping), so the image
# keeps the workspace layout: @repo/shared must resolve through its symlink
# to packages/shared, outside node_modules, where stripping is allowed.
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001 \
    UPLOADS_DIR=/data/uploads
WORKDIR /repo
COPY --from=api-deps /repo/node_modules ./node_modules
COPY --from=api-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
# Staff uploads live on a volume mounted here; a fresh named volume inherits
# this ownership, so the unprivileged user can write to it
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
WORKDIR /repo/apps/api
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "src/server.ts"]

# ------------------------------------------------------------------------ web
FROM base AS web-build
RUN pnpm install --frozen-lockfile --filter "@repo/web..."
# The transform resolves each file's tsconfig (they extend the base one)
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/web apps/web
# The public site URL is baked into canonical/og/JSON-LD at build time; a
# release build refuses to run without a real one. The API URL stays empty:
# the browser calls /api/… on the site's own origin, through nginx.
ARG VITE_SITE_URL
ENV RELEASE_BUILD=1 \
    VITE_SITE_URL=${VITE_SITE_URL} \
    VITE_API_URL=
RUN pnpm --filter @repo/web build
# The production SSR bundle includes its dependencies (ssr.noExternal), so the
# runtime needs only the build output, the server entry and srvx (which has no
# dependencies of its own) — not ~340 MB of node_modules.
RUN mkdir -p /runtime/node_modules \
 && cp -r apps/web/dist apps/web/server.mjs /runtime/ \
 && cp -rL apps/web/node_modules/srvx /runtime/node_modules/srvx \
 && echo '{"type":"module","private":true}' > /runtime/package.json

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=web-build /runtime ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.mjs"]
