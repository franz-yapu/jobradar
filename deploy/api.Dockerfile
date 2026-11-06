# JobRadar API image (SDD-012). Build from the repository root:
#   docker build -f deploy/api.Dockerfile -t jobradar-api .
FROM node:22-slim AS build
ENV CI=true
# Prisma picks its engine from the installed OpenSSL: same package in both stages.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Manifests first: the dependency layer is cached until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @jobradar/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @jobradar/api exec prisma generate \
 && pnpm --filter @jobradar/api build \
 && pnpm --filter @jobradar/api deploy --prod --ignore-scripts /out
# --ignore-scripts skipped the engine download: do it now, at build time, so the container never needs the network
# or write access to node_modules to apply migrations.
RUN cd /out && ./node_modules/.bin/prisma --version

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /out /app
COPY deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod 0755 /usr/local/bin/api-entrypoint.sh
# Not root: the app only needs to read its files and listen on PORT.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["api-entrypoint.sh"]
