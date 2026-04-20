# Proxy War 部署腳本 (Windows)
Write-Host "=== Proxy War 部署腳本 ===" -ForegroundColor Green
Write-Host "載入 Docker 鏡像..." -ForegroundColor Yellow

# 載入鏡像
docker load -i proxy-war-image.tar

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 鏡像載入成功" -ForegroundColor Green
} else {
    Write-Host "❌ 鏡像載入失敗" -ForegroundColor Red
    exit 1
}

Write-Host "啟動應用..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 應用啟動成功" -ForegroundColor Green
    Write-Host "🌐 訪問地址：http://localhost:8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "查看運行狀態：docker-compose ps" -ForegroundColor Gray
    Write-Host "查看日誌：docker-compose logs -f" -ForegroundColor Gray
    Write-Host "停止應用：docker-compose down" -ForegroundColor Gray
} else {
    Write-Host "❌ 應用啟動失敗" -ForegroundColor Red
    exit 1
}