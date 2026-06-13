/* ============================================================
   RETICEO Chat Proxy — Serveur Express
   Point d'entrée principal.

   Routes :
     GET  /health       → Vérification de l'état du serveur
     POST /api/chat     → Proxy sécurisé vers l'API Anthropic
   ============================================================ */
'use strict';
require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');

const PORT           = parseInt(process.env.PORT || '3001', 10);
const IS_DEV         = process.env.NODE_ENV !== 'production';
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '20', 10);

const SYSTEM_PROMPT = `
Tu es l'Assistant RETICEO, intégré au site institutionnel de RETICEO (www.reticeo.school).
RETICEO est un opérateur EdTech intégré, filiale de KA Technologie (Groupe KATEC), spécialisé
dans le déploiement d'infrastructures éducatives numériques souveraines en Afrique francophone.

Réponds uniquement aux questions liées à RETICEO, ses technologies, son modèle économique,
ses offres et ses marchés. Pour toute autre demande : info@reticeo.school.
Langue : FR par défaut, EN si la question est en anglais.
Ton : professionnel, direct, max 250 mots.
`.trim();

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquante');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type'], optionsSuccessStatus: 204 }));
app.use(express.json({ limit: '16kb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMIT_MAX,
  skip: () => IS_DEV,
  message: { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'reticeo-chat-proxy',
    timestamp: new Date().toISOString(),
    apiKeySet: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.post('/api/chat', limiter, async (req, res) => {
  const { message, history, page } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim())
    return res.status(400).json({ error: 'Message requis.' });
  if (message.length > 1000)
    return res.status(400).json({ error: 'Message trop long.' });

  const messages = [
    ...(Array.isArray(history) ? history : [])
      .filter(t => t && (t.role === 'user' || t.role === 'assistant') && t.content)
      .slice(-12),
    { role: 'user', content: message.trim() },
  ];

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: SYSTEM_PROMPT + (page ? `\n\n[Page consultée : ${page}]` : ''),
      messages,
    });
    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    res.json({ reply });
  } catch (err) {
    if (err?.status === 401) return res.status(500).json({ error: 'Clé API invalide.' });
    if (err?.status === 429) return res.status(503).json({ error: 'Service surchargé. Réessayez.' });
    console.error('[Proxy] Erreur:', err.message);
    res.status(500).json({ error: IS_DEV ? err.message : 'Erreur serveur.' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Route introuvable.' }));
app.use((err, _req, res, _next) => res.status(500).json({ error: 'Erreur interne.' }));

app.listen(PORT, () => {
  console.log(`\n✅  RETICEO Chat Proxy démarré sur le port ${PORT}`);
  console.log(`    Clé API : ${process.env.ANTHROPIC_API_KEY ? '✓ définie' : '✗ MANQUANTE'}\n`);
});
