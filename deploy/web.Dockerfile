# JobRadar web image (SDD-012): the Vite build served by Caddy, which also routes /api to the API.
# Build from the repository root:  docker build -f deploy/web.Dockerfile -t jobradar-web .
FROM node:22-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @jobradar/web...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# The browser calls the same origin under /api (the default of VITE_API_BASE); nothing is baked in.
# Only the bundle: type checking (which also covers the e2e specs) is `pnpm quality`, not the image build.
RUN pnpm --filter @jobradar/web exec vite build

FROM caddy:2-alpine AS runtime
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
