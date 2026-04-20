# Proxy War 部署到群暉說明

## 文件說明
- `proxy-war-image.tar` - 應用 Docker 鏡像
- `docker-compose.yml` - 容器配置
- `deploy.sh` - 部署腳本（Linux/Mac）
- `deploy.ps1` - 部署腳本（Windows）

## 部署步驟

### 1. 上傳文件到群暉
將所有文件上傳到群暉的共享資料夾或 Docker 目錄

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

## 停止應用
```bash
docker-compose down
```

## 查看日誌
```bash
docker-compose logs -f
```