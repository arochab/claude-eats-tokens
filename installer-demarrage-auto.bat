@echo off
chcp 65001 >nul
title Installer le demarrage automatique
cd /d "%~dp0"

set "CIBLE=%~dp0demarrer-silencieux.vbs"
set "DEMARRAGE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo.
echo   Installation du demarrage automatique de Claude Eats Tokens...
echo.

REM Cree un raccourci .lnk dans le dossier Demarrage via PowerShell
powershell -NoProfile -Command ^
  "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut('%DEMARRAGE%\ClaudeEatsTokens.lnk'); $s.TargetPath='%CIBLE%'; $s.WorkingDirectory='%~dp0'; $s.Save()"

if exist "%DEMARRAGE%\ClaudeEatsTokens.lnk" (
  echo   ✓ C'est fait ! Le moteur se lancera tout seul au demarrage de Windows.
  echo.
  echo   Lancement immediat pour cette session...
  wscript "%CIBLE%"
  echo   ✓ Le moteur tourne maintenant en arriere-plan ^(sans fenetre^).
) else (
  echo   ⚠ Echec de la creation du raccourci. Verifie les autorisations.
)
echo.
pause
