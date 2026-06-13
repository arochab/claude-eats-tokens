@echo off
chcp 65001 >nul
title Claude Eats Tokens — envoi des tokens
cd /d "%~dp0"

REM ===== Charge ton secret local (non versionne) =====
if not exist "secret.local.bat" (
  echo.
  echo   Fichier "secret.local.bat" introuvable.
  echo   Copie "secret.local.example.bat" en "secret.local.bat" et mets-y ton secret.
  echo.
  pause & exit /b
)
call "secret.local.bat"
set INTERVAL=60

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python n'est pas installe. https://www.python.org/downloads/
  echo   (coche "Add Python to PATH", puis relance ce fichier)
  echo.
  pause & exit /b
)

echo   Installation des dependances (une fois)...
python -m pip install --quiet requests >nul 2>nul

echo.
echo   Envoi de tes tokens vers %PUSH_URL% toutes les %INTERVAL%s.
echo   Laisse cette fenetre ouverte. Ferme-la quand tu veux.
echo.
python "tools\push_usage.py"
pause
