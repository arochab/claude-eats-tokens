@echo off
chcp 65001 >nul
title Installer la tache planifiee - Claude Eats Tokens
cd /d "%~dp0"

set "VBS=%~dp0demarrer-silencieux.vbs"
set "TACHE=ClaudeEatsTokens-Moteur"

echo.
echo   Installation de la tache planifiee (moteur en continu)...
echo.

REM Supprime l'ancien raccourci "Demarrage" fragile s'il existe
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ClaudeEatsTokens.lnk" 2>nul

REM Supprime une eventuelle ancienne tache du meme nom
schtasks /Delete /TN "%TACHE%" /F >nul 2>nul

REM Cree la tache : se lance a l'ouverture de session, lance le moteur silencieux
schtasks /Create /TN "%TACHE%" /TR "wscript.exe \"%VBS%\"" /SC ONLOGON /RL LIMITED /F

if %errorlevel%==0 (
  echo.
  echo   ✓ Tache planifiee creee : le moteur demarrera a chaque ouverture de session.
  echo.
  echo   Lancement immediat pour maintenant...
  start "" wscript.exe "%VBS%"
  echo   ✓ Le moteur tourne en arriere-plan (sans fenetre).
  echo.
  echo   Tes chiffres vont se rafraichir dans la minute.
) else (
  echo.
  echo   ⚠ Echec de creation. Essaie en clic droit ^> "Executer en tant qu'administrateur".
)
echo.
pause
