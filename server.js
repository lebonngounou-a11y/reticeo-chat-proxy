/* ============================================================
   RETICEO Chat Proxy — Client Anthropic
   Encapsule les appels à l'API Claude avec gestion d'erreurs.
   ============================================================ */
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./system-prompt');

const MODEL   = 'claude-sonnet-4-6';
const MAX_TOKENS = 600; /* Suffisant pour des réponses de chat (~450 mots max) */

/* Client initialisé une seule fois */
let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY non définie. Vérifiez votre fichier .env');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Envoie un message à Claude et retourne la réponse texte.
 *
 * @param {string}   userMessage   Message courant de l'utilisateur
 * @param {Array}    history       Historique [{role, content}, ...]
 * @param {string}   lang          'fr' | 'en'
 * @param {string}   page          Page d'origine (contexte)
 * @returns {Promise<string>}      Réponse textuelle de Claude
 */
async function getChatReply(userMessage, history = [], lang = 'fr', page = 'unknown') {
  const client = getClient();

  /* Construction des messages — historique + message courant */
  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  /* Contexte additionnel injecté dans le system prompt si pertinent */
  const contextNote = page !== 'unknown'
    ? `\n\n[Contexte : l'utilisateur consulte la page "${page}" du site.]`
    : '';

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     SYSTEM_PROMPT + contextNote,
    messages,
  });

  /* Extraire le texte — la réponse peut contenir plusieurs blocs */
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Réponse vide reçue de l\'API Anthropic');

  return text;
}

module.exports = { getChatReply };
