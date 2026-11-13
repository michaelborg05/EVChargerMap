# One image for local Docker and Render; only environment variables differ.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
# Node gives each IP address only 250 ms to connect before trying the next.
# European APIs (Overpass, OpenRouteService) are ~300 ms from Australia, so
# every attempt times out (ETIMEDOUT). 2 s is plenty and harmless elsewhere.
ENV NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000

# Install dependencies first so this layer is cached until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data

# Don't run as root. The official image ships a "node" user (uid 1000).
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
