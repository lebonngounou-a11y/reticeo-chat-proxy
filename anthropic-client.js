/* ============================================================
   RETICEO Chat Proxy — Validation & sanitisation des entrées
   ============================================================ */

const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '1000', 10);
const MAX_HISTORY_TURNS  = parseInt(process.env.MAX_HISTORY_TURNS  || '6',    10);

/**
 * Valide et nettoie le corps d'une requête /api/chat
 * @returns {{ ok: true, message, history, lang, page }
 *          | { ok: false, error: string, status: number }}
 */
function validateChatRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Corps de requête invalide.', status: 400 };
  }

  const { message, history, lang, page } = body;

  /* ── message ── */
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, error: 'Le champ "message" est requis et doit être une chaîne non vide.', status: 400 };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Le message dépasse la limite de ${MAX_MESSAGE_LENGTH} caractères.`, status: 400 };
  }

  /* ── history ── */
  const rawHistory = Array.isArray(history) ? history : [];
  const cleanHistory = rawHistory
    .filter(turn =>
      turn &&
      typeof turn === 'object' &&
      (turn.role === 'user' || turn.role === 'assistant') &&
      typeof turn.content === 'string' &&
      turn.content.trim().length > 0
    )
    .map(turn => ({
      role:    turn.role,
      content: String(turn.content).slice(0, MAX_MESSAGE_LENGTH * 2),
    }))
    .slice(-(MAX_HISTORY_TURNS * 2)); /* garder les N derniers tours */

  /* ── lang ── */
  const cleanLang = typeof lang === 'string' && ['fr', 'en'].includes(lang.toLowerCase())
    ? lang.toLowerCase()
    : 'fr';

  /* ── page ── */
  const allowedPages = /^[a-z0-9\-_/]{0,60}$/;
  const cleanPage = typeof page === 'string' && allowedPages.test(page) ? page : 'unknown';

  return {
    ok:      true,
    message: message.trim(),
    history: cleanHistory,
    lang:    cleanLang,
    page:    cleanPage,
  };
}

module.exports = { validateChatRequest };
