/* ============================================================
   RETICEO Chat Proxy — Script de test local
   Usage : node src/test-proxy.js
   Nécessite que le serveur tourne : npm run dev
   ============================================================ */
'use strict';

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

async function req(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

function pass(label) { console.log(`  ✅  ${label}`); }
function fail(label, detail) { console.error(`  ❌  ${label}`, detail || ''); }

async function runTests() {
  console.log(`\n🧪  Tests RETICEO Chat Proxy → ${BASE_URL}\n`);
  let ok = 0, ko = 0;

  /* ── 1. Health check ── */
  try {
    const { status, data } = await req('GET', '/health');
    if (status === 200 && data.status === 'ok' && data.apiKeySet) {
      pass('GET /health → 200, clé API présente'); ok++;
    } else {
      fail('GET /health', JSON.stringify(data)); ko++;
    }
  } catch (e) {
    fail('GET /health — serveur non démarré ?', e.message); ko++;
  }

  /* ── 2. Requête valide ── */
  try {
    const { status, data } = await req('POST', '/api/chat', {
      message: 'Qu\'est-ce que RETICEO ?',
      lang: 'fr',
      page: 'home',
    });
    if (status === 200 && typeof data.reply === 'string' && data.reply.length > 20) {
      pass(`POST /api/chat valide → réponse reçue (${data.reply.length} chars)`); ok++;
      console.log(`       Extrait : "${data.reply.slice(0, 120)}…"`);
    } else {
      fail('POST /api/chat valide', JSON.stringify(data)); ko++;
    }
  } catch (e) { fail('POST /api/chat', e.message); ko++; }

  /* ── 3. Requête EN ── */
  try {
    const { status, data } = await req('POST', '/api/chat', {
      message: 'What is RETICEO ?',
      lang: 'en',
    });
    if (status === 200 && data.reply) {
      pass(`POST /api/chat EN → réponse (${data.reply.length} chars)`); ok++;
    } else {
      fail('POST /api/chat EN', JSON.stringify(data)); ko++;
    }
  } catch (e) { fail('POST /api/chat EN', e.message); ko++; }

  /* ── 4. Message vide ── */
  try {
    const { status, data } = await req('POST', '/api/chat', { message: '   ' });
    if (status === 400 && data.error) {
      pass('POST /api/chat message vide → 400'); ok++;
    } else {
      fail('POST /api/chat message vide devrait retourner 400', JSON.stringify(data)); ko++;
    }
  } catch (e) { fail('POST /api/chat message vide', e.message); ko++; }

  /* ── 5. Message trop long ── */
  try {
    const { status, data } = await req('POST', '/api/chat', { message: 'x'.repeat(1001) });
    if (status === 400 && data.error) {
      pass('POST /api/chat message trop long → 400'); ok++;
    } else {
      fail('POST /api/chat message trop long devrait retourner 400', JSON.stringify(data)); ko++;
    }
  } catch (e) { fail('POST /api/chat message trop long', e.message); ko++; }

  /* ── 6. Corps JSON invalide ── */
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'pas du json {{{',
    });
    if (res.status === 400) {
      pass('POST /api/chat JSON invalide → 400'); ok++;
    } else {
      fail('POST /api/chat JSON invalide devrait retourner 400', res.status); ko++;
    }
  } catch (e) { fail('POST /api/chat JSON invalide', e.message); ko++; }

  /* ── 7. Route inconnue ── */
  try {
    const { status } = await req('GET', '/route-inconnue');
    if (status === 404) {
      pass('GET /route-inconnue → 404'); ok++;
    } else {
      fail('Route inconnue devrait retourner 404', status); ko++;
    }
  } catch (e) { fail('Route inconnue', e.message); ko++; }

  /* ── 8. Historique passé correctement ── */
  try {
    const { status, data } = await req('POST', '/api/chat', {
      message: 'Et le modèle BOO alors ?',
      lang: 'fr',
      history: [
        { role: 'user',      content: 'Qu\'est-ce que RETICEO ?' },
        { role: 'assistant', content: 'RETICEO est un opérateur EdTech en Afrique.' },
      ],
    });
    if (status === 200 && data.reply) {
      pass(`POST /api/chat avec historique → réponse contextuelle (${data.reply.length} chars)`); ok++;
    } else {
      fail('POST /api/chat avec historique', JSON.stringify(data)); ko++;
    }
  } catch (e) { fail('POST /api/chat historique', e.message); ko++; }

  /* ── Résumé ── */
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  Tests : ${ok + ko} · ✅ ${ok} · ❌ ${ko}`);
  if (ko === 0) console.log('  Tous les tests sont passés. 🎉');
  else console.log(`  ${ko} test(s) en échec.`);
  console.log();
  process.exit(ko > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('\n❌  Erreur fatale :', err.message);
  process.exit(1);
});
