# Installe (ou repare) le demarrage automatique du moteur Claude Eats Tokens.
# Cree une tache planifiee : demarre au boot + au login, se relance si plantage,
# sans limite de duree, fenetre cachee.
# A LANCER DANS UN POWERSHELL ADMIN (clic droit > Executer en tant qu'administrateur).
# Ne touche a AUCUN secret : configure seulement le declenchement de la tache.

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot   # le dossier du depot, deduit de l'emplacement du script
$vbs = Join-Path $dir "demarrer-silencieux.vbs"
$taskName = "ClaudeEatsTokens-Moteur"
$user = "$env:USERDOMAIN\$env:USERNAME"

Write-Host ""
Write-Host "Reparation de la tache '$taskName' pour $user ..." -ForegroundColor Cyan

# 1) Supprime l'ancienne tache (cassee)
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false; Write-Host "  - ancienne tache supprimee" } catch { Write-Host "  - (pas d'ancienne tache a supprimer)" }

# 2) Action : lance le .vbs silencieux qui appelle moteur.bat
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"{0}"' -f $vbs) -WorkingDirectory $dir

# 3) Declencheurs : au DEMARRAGE du PC + a chaque LOGIN
$tBoot  = New-ScheduledTaskTrigger -AtStartup
$tLogon = New-ScheduledTaskTrigger -AtLogOn -User $user

# 4) Reglages robustes : relance si plantage, AUCUNE limite de duree (le bug d'avant : 72h)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

# 5) Compte interactif (acces aux fichiers ~/.claude)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($tBoot, $tLogon) `
  -Settings $settings -Principal $principal `
  -Description "Pousse les tokens Claude vers Render. Demarre au boot + login, se relance seule, sans limite de duree." | Out-Null

# 6) Lance tout de suite
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

$t = Get-ScheduledTask -TaskName $taskName
Write-Host ""
Write-Host "TACHE REPAREE ET LANCEE." -ForegroundColor Green
Write-Host ("  Etat              : {0}" -f $t.State)
Write-Host ("  ExecutionTimeLimit: '{0}'  (vide = illimite)" -f $t.Settings.ExecutionTimeLimit)
Write-Host ("  Relance           : {0}x toutes les {1}" -f $t.Settings.RestartCount, $t.Settings.RestartInterval)
Write-Host ("  Declencheurs      : demarrage du PC + login")
Write-Host ""
Write-Host "Tu peux fermer cette fenetre. Le moteur tourne maintenant en arriere-plan, sans fenetre visible." -ForegroundColor Cyan
