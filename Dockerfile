FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production

COPY . .

EXPOSE 8080

ENV PORT=8080
ENV MONGO_URL=mongodb://mongo:27017/Proxy_War

CMD ["node", "server/server.js"]
