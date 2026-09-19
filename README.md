# Résumé YouTube (FR)

Extension Chrome (Manifest V3) qui résume **en français** la vidéo YouTube ouverte dans l'onglet actif,
à partir de sa transcription, via l'**API Mistral**.

## Installation

1. Ouvrir `chrome://extensions`
2. Activer **Mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** → sélectionner ce dossier (`resume-youtube-fr`)
4. Clic droit sur l'icône de l'extension → **Options** → coller votre clé API Mistral
   (à créer sur https://console.mistral.ai/api-keys), choisir le modèle, **Enregistrer**

## Utilisation

1. Ouvrir une vidéo sur `youtube.com/watch`
2. Cliquer sur l'icône de l'extension → le **panneau latéral** s'ouvre
3. Choisir le format (Court / Standard / Détaillé) → **Résumer**

Le résumé s'écrit en direct (streaming). Les horodatages sont **cliquables** : ils déplacent la lecture
de la vidéo au moment correspondant. Le résumé est mis en cache par vidéo ; « Regénérer » le recalcule.

## Fonctionnement

| Étape | Où | Détail |
|---|---|---|
| Transcription | `lib/transcript.js` | Récupère la page `watch`, en extrait `ytInitialPlayerResponse`, choisit la piste de sous-titres (français manuel > français auto > manuel > première disponible) et télécharge le `timedtext` en JSON (repli XML). |
| Repli | `content.js` | Si aucune piste n'est exploitable, l'extension ouvre le panneau « Transcription » de YouTube et en lit les segments. |
| Résumé | `lib/summarize.js` | Vidéo courte : un seul appel en streaming. Vidéo longue (> 60 000 caractères) : découpage en tranches de 40 000, notes intermédiaires, puis synthèse finale (map-reduce). |
| Rendu | `lib/markdown.js` | Mini-rendu Markdown sans dépendance (compatible CSP MV3), avec transformation des horodatages en liens de navigation. |

## Confidentialité

- La clé API est stockée dans `chrome.storage.local` (cet ordinateur uniquement, **pas** de synchronisation Google).
- Elle n'est envoyée qu'à `api.mistral.ai`.
- La transcription de la vidéo est transmise à Mistral pour être résumée. Rien d'autre ne sort du navigateur :
  pas de serveur tiers, pas de télémétrie.
- Les permissions demandées se limitent à `*.youtube.com` et `api.mistral.ai`.

## Sécurité des secrets

**Aucune clé API n'est présente dans ce dépôt, et il ne doit jamais y en avoir.**

- La clé est saisie par l'utilisateur dans la page Options et stockée dans `chrome.storage.local`
  (cet ordinateur uniquement, hors du dépôt, hors synchronisation Google).
- Dans le code, `apiKey` vaut toujours `''` par défaut et n'est lue qu'au moment de l'appel.
- Un hook `pre-commit` (`.githooks/pre-commit`, activé via `core.hooksPath`) refuse tout commit
  contenant une chaîne ressemblant à une clé : affectation `apiKey = "..."`, jeton `Bearer` littéral,
  ou chaîne isolée de 32 caractères alphanumériques.

Après un clone, réactiver le hook :

```bash
git config core.hooksPath .githooks
```

En cas de fuite malgré tout : **révoquer immédiatement la clé** sur
https://console.mistral.ai/api-keys, puis en générer une nouvelle. Réécrire l'historique git
ne suffit pas — une clé poussée doit être considérée comme compromise.

## Coût indicatif

Une vidéo de 30 min ≈ 30 000 caractères de transcription ≈ 9 000 jetons d'entrée.
Avec `mistral-small-latest`, cela reste de l'ordre du centime par résumé ; `mistral-large-latest`
coûte davantage mais produit des synthèses nettement plus fidèles.

## Limites connues

- Une vidéo **sans aucun sous-titre** (ni manuel ni automatique) ne peut pas être résumée : il n'y a rien à lire.
- Les **directs** en cours n'exposent pas de transcription complète.
- Les vidéos privées ou soumises à une vérification d'âge peuvent bloquer la récupération.
- Si YouTube modifie la structure de sa page, le repli DOM (`content.js`) est le point le plus susceptible
  de casser : les sélecteurs `ytd-transcript-segment-renderer` y sont centralisés.

## Structure

```
manifest.json      déclaration MV3
background.js      ouverture du panneau latéral
content.js         repli transcription + navigation dans la vidéo
sidepanel.html/css/js   interface du panneau
options.html/js    clé API, modèle, format par défaut
lib/transcript.js  extraction de la transcription
lib/mistral.js     client API Mistral (streaming SSE)
lib/summarize.js   prompts et stratégie map-reduce
lib/markdown.js    rendu Markdown minimal
icons/             icônes 16/48/128
```

## Licence

MIT — voir [LICENSE](LICENSE).
