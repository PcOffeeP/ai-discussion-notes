FROM node:22-alpine
WORKDIR /app

# 仅需生产环境与运行服务
COPY package*.json ./
RUN npm install --omit=dev

COPY server/ ./server/

ENV PORT=3000
ENV SYNC_SECRET_TOKEN=aidn-default-secret

EXPOSE 3000

CMD ["node", "server/sync-server.js"]
