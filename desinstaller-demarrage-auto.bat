@echo off
chcp 65001 >nul
set "DEMARRAGE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%DEMARRAGE%\ClaudeEatsTokens.lnk" 2>nul
echo   Demarrage automatique desactive.
echo   (Pour arreter le moteur en cours : ouvre le Gestionnaire des taches et termine "python")
pause
