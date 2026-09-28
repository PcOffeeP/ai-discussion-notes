FROM node:22-alpine
WORKDIR /app

# 仅需生产环境与运行服务
COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY core/settings.js ./core/settings.js

ENV PORT=3000
ENV SYNC_STORAGE_FILE=/data/cloud-notes.json
VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "server/sync-server.js"]
