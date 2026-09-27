# Changelog

Toutes les modifications notables de ce projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet applique le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.1.0] — 2026-09-27

Réparation d'urgence : l'extraction de transcription ne fonctionnait plus du tout.

### Corrigé

- **Route `timedtext` fermée par YouTube.** Les requêtes de sous-titres répondent désormais
  `HTTP 200` avec un **corps vide**, sur tous les formats (`json3`, `srv3`, `vtt`, brut) :
  un jeton de provenance est requis et ne peut pas être forgé. Vérifié dans un Chrome connecté,
  sur plusieurs vidéos disposant bien de sous-titres. La lecture du panneau « Transcription »
  du DOM devient la **route principale** ; `timedtext` est conservé en repli au cas où il
  redeviendrait exploitable.
- **Panneau transcription renommé par YouTube.** Les sélecteurs du repli DOM ne correspondaient
  plus à rien :
  - segment : `ytd-transcript-segment-renderer` → `transcript-segment-view-model`
  - horodatage : `.segment-timestamp` → `.ytwTranscriptSegmentViewModelTimestamp`
    (dont il faut retirer le libellé d'accessibilité `.ytwTranscriptSegmentViewModelTimestampA11yLabel`)
  - texte : `.segment-text` → `.ytAttributedStringHost`

  Les deux générations d'interface sont gérées.
- **Mauvais élément cliqué à l'ouverture du panneau.** La recherche du bouton ratissait
  `button, tp-yt-paper-button, yt-formatted-string` et attrapait un lien de la description,
  dont le clic ouvrait un nouvel onglet au lieu d'afficher la transcription. La recherche est
  restreinte aux vrais `<button>`, par libellé d'ouverture exact (plusieurs langues d'interface),
  avec exclusion explicite des boutons de fermeture.

### Modifié

- Message d'erreur du panneau reformulé : il décrivait des causes devenues fausses et orientait
  l'utilisateur vers une vérification inutile.
- Délai d'attente du chargement du panneau porté de 8 s à 12 s.

### Connu

- L'onglet YouTube doit rester ouvert et chargé pendant le résumé : l'extension lit le panneau
  de la page et ne peut plus travailler sur une vidéo en arrière-plan.

### Validation

Vidéo réelle de 16 min 27, page fraîchement chargée : 131 segments extraits,
20 967 caractères, de `0:00` à `16:20`, en 668 ms, sans onglet parasite.

## [1.0.0] — 2026-09-19

Version initiale.

### Ajouté

- Extension Chrome Manifest V3 avec panneau latéral, résumant en français la vidéo YouTube
  de l'onglet actif à partir de sa transcription.
- Extraction de la transcription via `ytInitialPlayerResponse` et les pistes `timedtext`
  (JSON puis repli XML), avec repli sur la lecture du panneau « Transcription » du DOM.
- Appel à l'API Mistral en streaming SSE ; sortie en français quelle que soit la langue
  de la vidéo ; trois formats de résumé (court, standard, détaillé).
- Stratégie map-reduce au-delà de 60 000 caractères pour les vidéos longues.
- Rendu Markdown minimal sans dépendance (compatible CSP MV3), horodatages cliquables
  déplaçant la lecture de la vidéo.
- Page d'options : clé API Mistral, choix du modèle, format par défaut, purge du cache.
- Mise en cache des résumés par vidéo.
- Garde-fous secrets : clé stockée en `chrome.storage.local`, `.gitignore` dédié et hook
  `pre-commit` refusant tout secret écrit en dur.

[1.1.0]: https://github.com/pquattro/resume-youtube-fr/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/pquattro/resume-youtube-fr/releases/tag/v1.0.0
