@echo off
rem 지인 지도 앱을 실행합니다 (더블클릭)
start "" http://localhost:8090/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8090
