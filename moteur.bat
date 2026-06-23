@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "secret.local.bat" (
  echo secret.local.bat introuvable — definis PUSH_URL et PUSH_SECRET. Voir .env.example.
  exit /b 1
)
call "secret.local.bat"
REM Boucle native de push_usage.py (toutes les INTERVAL secondes) — plus robuste
REM qu'une boucle .bat (pas de redemarrage de process a chaque cycle).
set INTERVAL=60
python "tools\push_usage.py" --interval %INTERVAL%
