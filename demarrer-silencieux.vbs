' Lance le moteur de push en arriere-plan, sans fenetre visible.
Set sh = CreateObject("WScript.Shell")
dossier = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' 0 = fenetre cachee, False = ne pas attendre la fin
sh.CurrentDirectory = dossier
sh.Run "cmd /c """"" & dossier & "\moteur.bat""""", 0, False
