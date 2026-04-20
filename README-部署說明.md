# Proxy War 部署到群暉說明

## 文件說明
- `proxy-war-image.tar` - 應用 Docker 鏡像（已包含所有依賴）
- `docker-compose.yml` - 容器配置（生產環境優化）
- `deploy.sh` - 部署腳本（Linux/Mac）
- `deploy.ps1` - 部署腳本（Windows）

## 部署步驟

### 1. 上傳文件到群暉
將所有文件上傳到群暉的共享資料夾

### 2. 載入鏡像
```bash
# 在群暉終端機執行
docker load -i proxy-war-image.tar
```

### 3. 運行應用
```bash
docker-compose up -d
```

### 4. 訪問應用
在瀏覽器打開：`http://群暉IP:8080`

## 關於自動化安裝

✅ **依賴已自動安裝**：所有 Node.js 依賴在 Docker 鏡像構建時就已安裝完成
- Dockerfile 中的 `RUN npm install --production` 會自動安裝所有依賴
- 生產環境不需要額外的安裝步驟

## 管理命令
- **查看狀態**：`docker-compose ps`
- **查看日誌**：`docker-compose logs -f`
- **停止應用**：`docker-compose down`