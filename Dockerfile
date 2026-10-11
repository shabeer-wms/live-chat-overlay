# Headless hosting: the same server as the desktop app, without Electron.
FROM node:22-alpine
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY public ./public

RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/auth/me || exit 1

CMD ["node", "server.js"]
