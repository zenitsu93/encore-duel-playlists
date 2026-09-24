# Encore — Duel aux playlists

Application multijoueur en français, sans dépendance npm. Node.js 20 ou supérieur (Node 22 conseillé pour les tests).

## Démarrage

```sh
npm start
```

Ouvrir http://localhost:4317. Guide utilisateur complet : http://localhost:4317/guide.

Créer un salon et partager son code avec un autre navigateur ou une fenêtre privée. Sur le même Wi-Fi, ouvrir l’adresse IP locale du serveur sur tous les appareils, par exemple `http://192.168.1.20:4317`. Le pare-feu doit autoriser le port. Pour jouer à distance, héberger ce serveur Node avec HTTPS et prise en charge des connexions SSE longues. Un lien localhost ne fonctionne que sur l’ordinateur serveur. `PORT` permet de modifier le port d’écoute.

## Fonctionnalités

- Salons privés de 2 à 12 joueurs, sans compte, prêts individuels et créateur participant.
- Avatars à choisir dans le salon (18 au choix, un par joueur), affichés dans le classement et sur le podium. Style « Big Smile » par Ashley Seo, sous licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), générés avec [DiceBear](https://www.dicebear.com) et hébergés dans `public/avatars/`.
- Import par lien Spotify public : métadonnées et URLs d’extraits exposées dans la page embed. Timeout de 20 secondes, cache de 5 minutes, validation du domaine et absence de redirection. Cinq sélections sauvegardées prêtes à jouer : Karaoke 🔥, Variét’ FR 🎤, King of Pop 👑, Love Songs 🌸 et Faso Vibes 🇧🇫 (liste dans `playlists.mjs`, instantanés dans `public/playlists/`).
- Import manuel `Artiste | Titre | URL audio`, maximum 100 morceaux par import et 1 000 morceaux distincts par salon. Le premier import remplace la démo.
- Déduplication artiste/titre avec conservation des contributeurs ; tirage équilibré à tour de rôle parmi leurs sélections disponibles, ou tirage aléatoire global.
- Questions titre, artiste ou les deux ; QCM à 4 réponses ou réponse écrite avec tolérance limitée aux fautes.
- Écoute classique (10–30 secondes) ou progressive : extraits de 2, 5 et 10 secondes aux instants 0, 7 et 17 d’une manche de 30 secondes.
- Bonus facultatif « Qui a ajouté ce son ? », 25 points, tous les propriétaires d’un doublon étant acceptés.
- Jokers 50/50 et +5 secondes personnelles, chacun utilisable une fois par partie. 50/50 uniquement en QCM. Jokers restitués si la manche est annulée.
- Équipes Or/Ciel de même taille au lancement ; somme des scores individuels et podium d’équipe.
- Réactions rapides après les manches et en fin de partie, fréquence limitée.
- Récap personnel : taux de réussite musical, meilleur temps de réponse complète, morceaux ratés, manches annulées, export CSV et revanche.
- Préchargement audio collectif, délai maximal de 15 secondes. Erreur de lecture ou blocage prolongé signalé par un client : annulation collective sans points.
- Reconnexion automatique dans le même onglet et reprise de la dernière session depuis le même navigateur. Retour en spectateur jusqu’à la manche suivante si le joueur n’était pas dans les participants de la préparation.
- Transfert manuel du rôle de créateur ; transfert automatique à un joueur connecté après 15 secondes d’absence.
- Page `/guide` expliquant l’ensemble des règles ; favicon et signature « Made by Christian BADOLO ».

## Spotify et limites

Le parseur utilise uniquement les données exposées par la page publique. Il ne garantit pas de récupérer toute une playlist : souvent seuls 100 morceaux sont exposés, sans pagination dans les données utilisées. Les titres sans extrait sont exclus et comptabilisés dans le résultat d’import. Les playlists privées et les pages dont le format a changé sont refusées avec un message. L’accès réseau sortant vers Spotify est nécessaire.

L’audio est lu depuis les liens distants ; il n’est pas téléchargé sur le serveur. Ces liens peuvent expirer. L’accès technique n’accorde aucun droit de réutilisation ; les conditions Spotify relatives à l’intégration dans des jeux restent applicables. Ce projet est un prototype local, pas une validation de diffusion publique.

La page `/spotify` conserve le diagnostic du lecteur officiel visible (lecture, pause, événements). Le jeu utilise les liens d’extraits récupérés, pas un embed masqué. `import-spotify.mjs fichier.html` reste disponible pour générer un instantané JSON et un CSV depuis une copie HTML de la page publique.

Les salons et les résultats sont en mémoire : un redémarrage les efface. Les salons vides expirent après deux heures. Les identités sont stockées dans le navigateur ; ce n’est pas un système de comptes. Les scores sont calculés côté serveur, mais les URLs audio sont inspectables et un signalement client peut annuler une manche : usage entre amis, sans protection contre la triche. Un joueur déconnecté peut manquer des manches. La synchronisation reste dépendante du réseau et du navigateur.

Avant une ouverture publique : persistance, authentification adaptée, limitations globales de requêtes, supervision, modération des imports et source musicale autorisée.

## Vérifications

```sh
npm test
# Avec le serveur lancé :
npm run test:integration
```

Tests de logique : barèmes, réponses libres, répartition des sélections, bonus, équipes, jokers privés, annulation/restauration des jokers, événements périmés, préchargement et transfert de rôle. Tests de rendu du client avec DOM simulé ; ce ne sont pas des tests visuels de navigateur. Le test HTTP/SSE joue une partie à deux avec chargement, points, réaction, revanche et transfert manuel.

L’import réseau réel de la playlist fournie a été vérifié avec 100 extraits. La lecture effective et l’affichage sur mobile nécessitent une vérification dans un navigateur ; aucun navigateur connecté n’était disponible pendant cette modification.
