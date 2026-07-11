# Installe (ou repare) le demarrage automatique du moteur Claude Eats Tokens.
# v2 : la tache lance pythonw.exe tools\moteur.py DIRECTEMENT (plus de chaine
# wscript -> cmd -> .bat, que certains antivirus tuent en silence).
# Deux declencheurs : a chaque login + toutes les 5 minutes (watchdog).
# Le moteur a un verrou interne : s'il tourne deja, la relance est sans effet —
# donc un moteur mort est ressuscite en moins de 5 minutes, automatiquement.
# Pas besoin d'admin. Ne touche a AUCUN secret.

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot   # le dossier du depot, deduit de l'emplacement du script
$moteur = Join-Path $dir "tools\moteur.py"
$taskName = "ClaudeEatsTokens-Watchdog"
$user = "$env:USERDOMAIN\$env:USERNAME"

# Trouve pythonw.exe (aucune fenetre) : PATH d'abord, puis installs standard.
$pyw = $null
try { $pyw = (Get-Command pythonw.exe -ErrorAction Stop).Source } catch {}
if (-not $pyw) {
  foreach ($v in @("Python313", "Python312", "Python311")) {
    $c = Join-Path $env:LocalAppData "Programs\Python\$v\pythonw.exe"
    if (Test-Path $c) { $pyw = $c; break }
  }
}
if (-not $pyw) {
  Write-Host "pythonw.exe introuvable — installe Python (python.org) avec 'Add to PATH'." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Installation de la tache '$taskName' pour $user ..." -ForegroundColor Cyan
Write-Host "  pythonw : $pyw"

# 1) Supprime les anciennes versions de la tache
foreach ($old in @($taskName, "ClaudeEatsTokens-Moteur")) {
  try { Unregister-ScheduledTask -TaskName $old -Confirm:$false -ErrorAction Stop; Write-Host "  - ancienne tache '$old' supprimee" } catch {}
}

# 2) Action : pythonw moteur.py — aucun intermediaire, aucune fenetre
$action = New-ScheduledTaskAction -Execute $pyw -Argument ('"{0}"' -f $moteur) -WorkingDirectory $dir

# 3) Declencheurs : login + toutes les 5 minutes (relance si le moteur est mort)
$tLogon  = New-ScheduledTaskTrigger -AtLogOn -User $user
$tRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)

# 4) Reglages robustes : aucune limite de duree, pas de doublons
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

# 5) Compte interactif (acces aux fichiers ~/.claude)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($tLogon, $tRepeat) `
  -Settings $settings -Principal $principal `
  -Description "Watchdog Claude Eats Tokens : (re)lance pythonw tools/moteur.py au login + toutes les 5 min. Verrou anti-doublon dans le script." | Out-Null

# 6) Lance tout de suite
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

$t = Get-ScheduledTask -TaskName $taskName
Write-Host ""
Write-Host "TACHE INSTALLEE ET LANCEE." -ForegroundColor Green
Write-Host ("  Etat         : {0}" -f $t.State)
Write-Host ("  Declencheurs : login + toutes les 5 minutes (watchdog)")
Write-Host ("  Diagnostic   : logs\moteur.log et logs\heartbeat.log dans le depot")
Write-Host ""
Write-Host "Le moteur tourne en arriere-plan, sans fenetre. S'il meurt, il revient tout seul en moins de 5 minutes." -ForegroundColor Cyan
