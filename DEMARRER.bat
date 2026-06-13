@echo off
chcp 65001 >nul
title Claude Eats Tokens — envoi des tokens
cd /d "%~dp0"

REM ===== Configure ces 2 lignes (une seule fois) =====
set PUSH_URL=https://claude-eats-tokens.onrender.com
set PUSH_SECRET=change-moi-en-un-secret-long
REM (optionnel) usage facture a l'API :
REM set ANTHROPIC_ADMIN_KEY=sk-ant-admin-xxxx
set INTERVAL=60

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python n'est pas installe. Telecharge-le : https://www.python.org/downloads/
  echo   (coche "Add Python to PATH" a l'installation, puis relance ce fichier)
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
