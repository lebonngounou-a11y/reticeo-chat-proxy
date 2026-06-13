/* ============================================================
   RETICEO Chat Proxy — Serveur Express
   Point d'entrée principal.

   Routes :
     GET  /health       → Vérification de l'état du serveur
     POST /api/chat     → Proxy sécurisé vers l'API Anthropic
   ============================================================ */
'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const { validateChatRequest } = require('./validate');
const { getChatReply }        = require('./anthropic-client');

/* ── Config ── */
const PORT           = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://www.reticeo.school';
const IS_DEV         = process.env.NODE_ENV !== 'production';
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '20', 10);

/* ── App ── */
const app = express();

/* ────────────────────────────────────────────────
   MIDDLEWARES GLOBAUX
──────────────────────────────────────────────── */

/* Sécurité HTTP headers */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

/* CORS — autoriser uniquement le domaine front-end */
const corsOptions = {
  origin(origin, callback) {
    /* Autoriser les requêtes sans origin (Postman, curl) uniquement en dev */
    if (!origin && IS_DEV) return callback(null, true);

    if (origin === ALLOWED_ORIGIN) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqué : origine non autorisée → ${origin}`));
    }
  },
  methods:          ['POST', 'GET', 'OPTIONS'],
  allowedHeaders:   ['Content-Type'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

/* Parsing JSON — limiter la taille pour éviter les abus */
app.use(express.json({ limit: '16kb' }));

/* ────────────────────────────────────────────────
   RATE LIMITING
   20 requêtes / 15 min / IP — ajustable via .env
──────────────────────────────────────────────── */
const chatLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, /* 15 minutes */
  max:              RATE_LIMIT_MAX,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    error: 'Trop de requêtes. Réessayez dans quelques minutes.',
    retryAfter: '15 minutes',
  },
  skip: () => IS_DEV, /* Désactivé en développement */
});

/* ────────────────────────────────────────────────
   ROUTES
──────────────────────────────────────────────── */

/** GET /health — Vérification de l'état du proxy */
app.get('/health', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    status: 'ok', service: 'reticeo-chat-proxy',
    timestamp: new Date().toISOString(),
    apiKeySet: !!process.env.ANTHROPIC_API_KEY,
  });
});

/** POST /api/chat — Proxy principal */
app.post('/api/chat', chatLimiter, async (req, res) => {
  /* 1. Validation de l'entrée */
  const validated = validateChatRequest(req.body);
  if (!validated.ok) {
    return res.status(validated.status).json({ error: validated.error });
  }

  const { message, history, lang, page } = validated;

  /* 2. Appel à l'API Anthropic */
  try {
    const reply = await getChatReply(message, history, lang, page);
    return res.json({ reply });

  } catch (err) {
    /* Erreurs Anthropic spécifiques */
    if (err?.status === 401) {
      console.error('[RETICEO Proxy] Clé API Anthropic invalide');
      return res.status(500).json({ error: 'Erreur de configuration serveur. Contactez l\'administrateur.' });
    }
    if (err?.status === 429) {
      console.warn('[RETICEO Proxy] Rate limit Anthropic atteint');
      return res.status(503).json({ error: 'Service temporairement surchargé. Réessayez dans quelques instants.' });
    }
    if (err?.status === 529 || err?.message?.includes('overloaded')) {
      return res.status(503).json({ error: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
    }

    /* Erreur générique — ne pas exposer les détails en production */
    console.error('[RETICEO Proxy] Erreur inattendue:', IS_DEV ? err : err.message);
    return res.status(500).json({
      error: IS_DEV
        ? `Erreur serveur : ${err.message}`
        : 'Une erreur est survenue. Réessayez ou contactez info@reticeo.school',
    });
  }
});

/* ────────────────────────────────────────────────
   GESTION DES ROUTES INCONNUES
──────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

/* Gestionnaire d'erreurs global (CORS, JSON malformé, etc.) */
app.use((err, _req, res, _next) => {
  if (err.message?.startsWith('CORS bloqué')) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON malformé.' });
  }
  console.error('[RETICEO Proxy] Erreur non gérée:', err.message);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

/* ────────────────────────────────────────────────
   DÉMARRAGE
──────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n✅  RETICEO Chat Proxy démarré`);
  console.log(`    Port          : ${PORT}`);
  console.log(`    Environnement : ${IS_DEV ? 'development' : 'production'}`);
  console.log(`    CORS autorisé : ${ALLOWED_ORIGIN}`);
  console.log(`    Clé API       : ${process.env.ANTHROPIC_API_KEY ? '✓ définie' : '✗ MANQUANTE — vérifiez .env'}`);
  console.log(`    Rate limit    : ${IS_DEV ? 'désactivé (dev)' : RATE_LIMIT_MAX + ' req/15min/IP'}`);
  console.log(`\n    Health check  : http://localhost:${PORT}/health`);
  console.log(`    Endpoint chat : POST http://localhost:${PORT}/api/chat\n`);
});

module.exports = app; /* Export pour les tests */
