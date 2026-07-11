' Lance le moteur de push en arriere-plan, sans fenetre visible.
' v2 : lance pythonw tools\moteur.py directement (plus de chaine cmd/bat,
' que certains antivirus tuent en silence). Le moteur a un verrou interne :
' le relancer alors qu'il tourne deja est sans effet.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dossier

moteur = dossier & "\tools\moteur.py"

' Cherche pythonw.exe : install standard, puis PATH.
pythonw = ""
chemins = Array( _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\Python\Python312\pythonw.exe", _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\Python\Python313\pythonw.exe", _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\Python\Python311\pythonw.exe")
For Each c In chemins
  If pythonw = "" And fso.FileExists(c) Then pythonw = c
Next
If pythonw = "" Then pythonw = "pythonw.exe" ' espoir : sur le PATH

' 0 = fenetre cachee, False = ne pas attendre la fin
sh.Run """" & pythonw & """ """ & moteur & """", 0, False
