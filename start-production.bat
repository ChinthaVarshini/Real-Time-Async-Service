@echo off
echo ========================================
echo   PRODUCTION ASYNC TASK PROCESSOR
echo ========================================
echo.

cd /d "%~dp0"

echo Stopping any existing containers...
docker-compose down

echo.
echo Building and starting services...
docker-compose up --build -d

echo.
echo Waiting for services to start...
timeout /t 10 /nobreak >nul

echo.
echo Generating JWT token...
docker-compose exec gateway bun run apps/gateway/generateToken.ts

echo.
echo ========================================
echo   PRODUCTION SYSTEM READY!
echo ========================================
echo   Dashboard: http://localhost:4000
echo   Redis: localhost:6379 (in container)
echo   Gateway: Running in container
echo   Workers: 2 replicas running
echo ========================================
echo.
echo Press any key to view logs (Ctrl+C to exit)...
pause >nul

docker-compose logs -f
echo Press any key to view logs (Ctrl+C to exit)...
pause >nul

docker-compose logs -f