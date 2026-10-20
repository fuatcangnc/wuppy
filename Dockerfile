# Wuppy site (the starter template) as a Node standalone server.
# Content and state live in /data so one volume keeps files, Git history and the auth database.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @wuppy/admin build \
 && pnpm --filter wuppy-starter build

FROM node:24-slim
# Every content write is a Git commit, so the image needs git.
RUN apt-get update && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
EXPOSE 4321
VOLUME ["/app/templates/starter/content", "/app/templates/starter/.wuppy"]
USER node
WORKDIR /app/templates/starter
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4321/api/setup').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]
