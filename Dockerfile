# Wuppy site (the starter template) as a Node standalone server. The same image also runs wuppycms.com
# (`landing/`): set working_dir /app/landing and command `node /app/templates/starter/serve.mjs` (runs a picked theme too).
# Content and state live in /data so one volume keeps files, Git history and the auth database.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @wuppycms/admin build \
 && pnpm --filter wuppy-starter build \
 && pnpm --filter @wuppycms/landing build

FROM node:24-slim
# Every content write is a Git commit, so the image needs git; ca-certificates lets it clone GitHub themes over HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# Volume mount points must exist and belong to node, or Docker creates them root-owned.
RUN for d in /app/templates/starter /app/landing; do cd $d && mkdir -p .wuppy public/uploads .git && chown node:node .wuppy public/uploads .git content; done
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
EXPOSE 4321
# Content, uploads, Git history and the auth database all survive a container rebuild.
VOLUME ["/app/templates/starter/content", "/app/templates/starter/public/uploads", "/app/templates/starter/.git", "/app/templates/starter/.wuppy"]
USER node
WORKDIR /app/templates/starter
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4321/api/setup').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "serve.mjs"]
