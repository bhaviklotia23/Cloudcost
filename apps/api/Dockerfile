# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@cloudcost/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build --workspace=@cloudcost/api

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@cloudcost/api --include-workspace-root=false --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/package.json ./apps/api/
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Same image runs three ways (ECS task definitions / compose):
#   API:        node dist/main.js
#   Worker:     node dist/worker.js
#   Migrations: node dist/db/migrate.js   (one-off task before deploy)
CMD ["node", "dist/main.js"]
