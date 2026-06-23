# Installe une tache planifiee Windows qui lance le moteur Claude Eats Tokens
# en continu (au demarrage de session + redemarrage auto si plante).
# A LANCER EN ADMIN : clic droit > "Executer avec PowerShell" en admin,
# ou : powershell -ExecutionPolicy Bypass -File "installer-tache-auto.ps1"

$ErrorActionPreference = 'Stop'
$dir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs   = Join-Path $dir "demarrer-silencieux.vbs"
$tache = "ClaudeEatsTokens-Moteur"

Write-Host ""
Write-Host "  Installation de la tache planifiee (moteur en continu)..." -ForegroundColor Cyan
Write-Host ""

# Supprime une eventuelle ancienne tache du meme nom
schtasks /Delete /TN $tache /F 2>$null | Out-Null

# Action : lance le moteur silencieux (boucle native python)
$action    = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbs + '"') -WorkingDirectory $dir
# Declencheur : a chaque ouverture de session
$trigger   = New-ScheduledTaskTrigger -AtLogOn
# Reglages : demarre meme sur batterie, redemarre si plante (jusqu'a 99x, ttes les min)
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1)
# Tourne sous l'utilisateur courant, sans elevation (Limited)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $tache -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "  OK : tache '$tache' creee." -ForegroundColor Green
Write-Host "       Le moteur demarrera a chaque ouverture de session et se"
Write-Host "       relancera tout seul s'il s'arrete."
Write-Host ""

# Lancement immediat pour maintenant
Start-ScheduledTask -TaskName $tache
Write-Host "  Le moteur tourne maintenant (en arriere-plan, sans fenetre)." -ForegroundColor Green
Write-Host "  Tes chiffres vont se rafraichir dans la minute."
Write-Host ""
Write-Host "  Appuie sur une touche pour fermer..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
