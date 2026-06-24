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
REM En plus, toutes les ~10 min (REFRESH_EVERY cycles), on capture le VRAI %
REM officiel des fenetres (5h/7j) : refresh-windows.py rafraichit le jeton via
REM "claude -p" si besoin, interroge l'endpoint, et ecrit usage-windows.json
REM que push_usage.py pousse ensuite. Peu de tokens (1 mini-requete / 10 min).
set INTERVAL=60
set REFRESH_EVERY=10
set /a TICK=REFRESH_EVERY
:loop
if %TICK% GEQ %REFRESH_EVERY% (
  python "tools\refresh-windows.py"
  set /a TICK=0
)
python "tools\push_usage.py" --once
set /a TICK+=1
timeout /t %INTERVAL% /nobreak >nul
goto loop
