@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "secret.local.bat" (
  echo secret.local.bat introuvable — definis PUSH_URL et PUSH_SECRET. Voir .env.example.
  exit /b 1
)
call "secret.local.bat"
REM Boucle .bat : un envoi --once toutes les INTERVAL secondes. Plus robuste que
REM la boucle interne de python (qui restait silencieuse sans pousser).
set INTERVAL=60
:loop
python "tools\push_usage.py" --once
timeout /t %INTERVAL% /nobreak >nul
goto loop
