
# 使用官方 Node.js 基礎映像
FROM node:18-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json 到工作目錄
COPY package*.json ./

# 安裝應用程式的依賴
RUN npm install && npm install ws

# 複製所有檔案到工作目錄
COPY . .

# 暴露應用程式監聽的埠
EXPOSE 3000

# 定義啟動應用程式的命令
CMD [ "node", "server/server.js" ]
