# RETICEO Chat Proxy

Proxy Node.js/Express sécurisé entre le site `reticeo.school` et l'API Anthropic (Claude).  
Il expose un seul endpoint `POST /api/chat` que le widget `chat-ai-bridge.js` appelle depuis le front-end.

---

## Architecture

```
Navigateur visiteur
       │
       │  POST /api/chat  (domaine reticeo.school uniquement)
       ▼
┌─────────────────────────┐
│   RETICEO Chat Proxy    │  ← ce serveur
│   Node.js / Express     │
│                         │
│  • Validation entrée    │
│  • CORS strict          │
│  • Rate limiting        │
│  • System prompt RETICEO│
└──────────┬──────────────┘
           │  ANTHROPIC_API_KEY (jamais exposée au front)
           ▼
     API Anthropic
     claude-sonnet-4-6
```

---

## Installation

```bash
# 1. Cloner ou copier ce dossier sur le serveur
cd reticeo-chat-proxy

# 2. Installer les dépendances
npm install

# 3. Créer le fichier d'environnement
cp .env.example .env
nano .env   # Remplir ANTHROPIC_API_KEY et ALLOWED_ORIGIN
```

---

## Configuration `.env`

| Variable | Obligatoire | Valeur type |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | `sk-ant-...` — obtenir sur [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `ALLOWED_ORIGIN` | ✅ | `https://www.reticeo.school` |
| `PORT` | ✅ | `3001` (ou tout port libre) |
| `NODE_ENV` | ✅ | `production` |
| `RATE_LIMIT_MAX` | Non | `20` (requêtes / 15 min / IP) |
| `MAX_MESSAGE_LENGTH` | Non | `1000` (caractères) |
| `MAX_HISTORY_TURNS` | Non | `6` (tours de conversation) |

---

## Démarrage

```bash
# Développement (rechargement automatique)
npm run dev

# Production
npm start

# Avec PM2 (recommandé en production)
npm install -g pm2
pm2 start src/server.js --name reticeo-chat-proxy
pm2 save
pm2 startup
```

---

## Tests

```bash
# Démarrer le serveur en dev dans un terminal
npm run dev

# Dans un autre terminal
npm test
```

Résultat attendu :
```
✅  GET /health → 200, clé API présente
✅  POST /api/chat valide → réponse reçue
✅  POST /api/chat EN → réponse
✅  POST /api/chat message vide → 400
✅  POST /api/chat message trop long → 400
✅  POST /api/chat JSON invalide → 400
✅  GET /route-inconnue → 404
✅  POST /api/chat avec historique → réponse contextuelle
Tests : 8 · ✅ 8 · ❌ 0
```

---

## Intégration avec le site RETICEO

Dans `js/site-config.js` du site front-end, activer le pont IA :

```js
window.RETICEO_CONFIG = {
  web3formsKey:    '...',
  notifyEmail:     'info@reticeo.school',
  chatAIEnabled:   true,
  chatAIEndpoint:  'https://api.reticeo.school/api/chat',
  // ou en développement : 'http://localhost:3001/api/chat'
};
```

---

## Déploiement — Options recommandées

### Option A — VPS Linux (Ubuntu/Debian)

```bash
# Sur le serveur
sudo apt install nodejs npm
npm install -g pm2

# Configurer un reverse proxy Nginx devant le proxy Node
# → https://www.reticeo.school/api/chat  pointe vers  http://localhost:3001/api/chat
```

Bloc Nginx à ajouter dans la config du site :
```nginx
location /api/chat {
    proxy_pass         http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_read_timeout 30s;
}
```

### Option B — Vercel (serverless)

Renommer `src/server.js` en `api/chat.js` et adapter pour Vercel Edge Functions.  
Le fichier `src/anthropic-client.js` et `src/system-prompt.js` restent identiques.

### Option C — Railway / Render

Déploiement direct depuis GitHub. Ajouter les variables d'environnement dans le dashboard.  
`npm start` comme commande de démarrage.

---

## Sécurité

- La clé `ANTHROPIC_API_KEY` ne quitte jamais le serveur.
- CORS strict : seul `ALLOWED_ORIGIN` peut appeler `/api/chat`.
- Rate limiting : 20 req/15min/IP en production.
- Taille du payload limitée à 16KB.
- Headers HTTP durcis par `helmet`.
- Messages trop longs rejetés avant l'appel API.
- Erreurs internes non exposées en production.
