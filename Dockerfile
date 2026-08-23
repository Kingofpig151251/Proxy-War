# PROXY WAR v2 — 多階段構建
# Stage 1: 構建（server tsc + client vite）
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY shared ./shared
COPY src ./src
COPY client ./client
RUN npm run build

# Stage 2: 運行（只帶 prod 依賴＋產物）
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3000
USER node
CMD ["node", "dist/src/server.js"]
