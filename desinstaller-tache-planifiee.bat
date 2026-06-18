@echo off
chcp 65001 >nul
set "TACHE=ClaudeEatsTokens-Moteur"
schtasks /Delete /TN "%TACHE%" /F
echo   Tache planifiee supprimee.
echo   (Le moteur en cours s'arretera au prochain redemarrage, ou termine "wscript"/"python" dans le Gestionnaire des taches.)
pause
