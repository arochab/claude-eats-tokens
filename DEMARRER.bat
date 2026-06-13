@echo off
chcp 65001 >nul
title Claude Eats Tokens - envoi des tokens
cd /d "%~dp0"
setlocal enabledelayedexpansion

if not exist "secret.local.bat" (
  echo.
  echo   Fichier "secret.local.bat" introuvable.
  echo   Copie "secret.local.example.bat" en "secret.local.bat" et mets-y ton secret.
  echo.
  pause
  goto :eof
)

REM Charge PUSH_URL / PUSH_SECRET depuis le fichier secret
call "secret.local.bat"

if "%PUSH_URL%"=="" (
  echo   PUSH_URL est vide dans secret.local.bat — corrige-le.
  pause
  goto :eof
)
if "%PUSH_SECRET%"=="" (
  echo   PUSH_SECRET est vide dans secret.local.bat — corrige-le.
  pause
  goto :eof
)

set INTERVAL=60

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python n'est pas installe : https://www.python.org/downloads/
  echo   (coche "Add Python to PATH", puis relance)
  echo.
  pause
  goto :eof
)

echo   Installation des dependances (une fois)...
python -m pip install --quiet requests

echo.
echo   Envoi vers %PUSH_URL% toutes les %INTERVAL%s.
echo   Laisse cette fenetre ouverte. Ctrl+C ou ferme-la pour arreter.
echo.

:loop
python "tools\push_usage.py" --once
timeout /t %INTERVAL% /nobreak >nul
goto loop
