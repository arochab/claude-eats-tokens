# Confort : app toujours à jour + jamais d'erreur de chargement

Deux réglages, une seule fois. Après ça, tu n'as plus rien à faire.

---

## A) Démarrage automatique du moteur (PC allumé = chiffres frais)

Le « moteur » lit tes logs Claude Code et pousse tes chiffres. On le fait
démarrer tout seul, en arrière-plan (sans fenêtre noire).

**1 seul double-clic :** lance **`installer-demarrage-auto.bat`**

Ça crée un raccourci dans le dossier Démarrage de Windows ET lance le moteur
tout de suite pour cette session. Désormais, à chaque allumage du PC, le moteur
tourne en fond automatiquement.

- Pour vérifier qu'il tourne : Gestionnaire des tâches → onglet Détails →
  tu verras un `python.exe`.
- Pour tout arrêter / annuler : double-clic sur **`desinstaller-demarrage-auto.bat`**.

> Note : ça ne marche que quand ton PC est allumé (c'est lui qui lit les logs).

---

## B) Persistance Gist (l'app s'ouvre toujours, même PC éteint)

Sans ça, le serveur gratuit s'endort et « oublie » tes chiffres → l'app peut
afficher « Impossible de charger ». La Gist lui sert de mémoire durable.

### B.1 — Créer une Gist privée (le coffre)
1. Va sur **https://gist.github.com**
2. Dans « Filename including extension… » mets : `usage.json`
3. Dans le contenu, mets juste : `{}`
4. En bas, clique **« Create secret gist »** (secret = privé).
5. Regarde l'URL de la page : `https://gist.github.com/arochab/XXXXXXXXXXXX`
   → le bout `XXXXXXXXXXXX` est ton **GIST_ID**. Note-le.

### B.2 — Créer un token GitHub (la clé du coffre)
1. Va sur **https://github.com/settings/tokens**
2. **Generate new token** → **classic**.
3. Note (nom) : `claude-eats-tokens`, Expiration : 90 days (ou plus).
4. Coche UNIQUEMENT la case **`gist`**.
5. **Generate token** → copie le `ghp_...` (tu ne le reverras plus). C'est ton
   **GITHUB_TOKEN**.

### B.3 — Donner ces 2 valeurs à Render
1. Va sur ton service Render → onglet **Environment**.
2. Ajoute/renseigne :
   - `GITHUB_TOKEN` = ton `ghp_...`
   - `GIST_ID` = le `XXXXXXXXXXXX`
3. **Save** → Render redéploie (~1 min). Fini : le serveur garde tes chiffres
   même quand il dort.

---

## C'est tout

- **PC allumé** : moteur auto → chiffres frais en continu.
- **PC éteint / serveur endormi** : l'app charge quand même les derniers
  chiffres connus (grâce à la Gist).
- **Sur ton tel** : l'icône s'ouvre toujours, plus jamais « Impossible de charger ».
