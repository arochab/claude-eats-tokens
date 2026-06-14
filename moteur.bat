@echo off
cd /d "%~dp0"
if not exist "secret.local.bat" exit /b
call "secret.local.bat"
set INTERVAL=60
:loop
python "tools\push_usage.py" --once
timeout /t %INTERVAL% /nobreak >nul
goto loop
