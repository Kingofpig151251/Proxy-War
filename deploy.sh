#!/bin/bash

echo "=== Proxy War 部署腳本 ==="
echo "載入 Docker 鏡像..."

# 載入鏡像
docker load -i proxy-war-image.tar

if [ $? -eq 0 ]; then
    echo "✅ 鏡像載入成功"
else
    echo "❌ 鏡像載入失敗"
    exit 1
fi

echo "啟動應用..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo "✅ 應用啟動成功"
    echo "🌐 訪問地址：http://localhost:8080"
    echo ""
    echo "查看運行狀態：docker-compose ps"
    echo "查看日誌：docker-compose logs -f"
    echo "停止應用：docker-compose down"
else
    echo "❌ 應用啟動失敗"
    exit 1
fi