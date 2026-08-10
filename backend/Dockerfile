# ============================================================
# Shine On You — Admin-Backend
#
# WICHTIG: Der Build-Kontext ist das Repo-Wurzelverzeichnis, nicht
# backend/. Der Renderer unter shared/ wird von beiden Seiten
# gebraucht (Website-Build und Vorschau im Admin) und muss deshalb
# mit ins Image:
#
#   docker build -f backend/Dockerfile -t soy-admin .
#
# Node 24: node:sqlite ist dort fest eingebaut – kein Compiler und
# keine native Abhängigkeit im Image nötig.
# ============================================================

FROM node:24-alpine AS deps

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
# wrangler & Co. bleiben draußen – im Container läuft nur der Node-Server.
RUN npm ci --omit=dev && npm cache clean --force


FROM node:24-alpine

# tini reicht Signale sauber durch, damit der Container zügig stoppt.
RUN apk add --no-cache tini wget

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/soy-admin.db

WORKDIR /app/backend

COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend/package.json backend/schema.sql ./
COPY backend/src ./src
COPY backend/public ./public
COPY backend/scripts ./scripts
# Muss auf /app/shared liegen: src/content.js greift über ../../shared darauf zu.
COPY shared /app/shared

# Die Datenbank gehört ins Volume, nicht ins Image.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

EXPOSE 8080

# CMD-SHELL, damit ein geändertes PORT auch hier greift.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/ping" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/node.js"]
