// Helpers compartilhados pelos smoke tests (scripts/smoke*.js).
// Centraliza request/login/log/fail para não duplicar esse bloco em
// cada script novo. Uso:
//
//   const { criarCliente } = require('./_smoke-lib');
//   const { BASE, SENHA, log, fail, req, login } = criarCliente();
//
require('dotenv').config();

function criarCliente({ base, senha, redirectManual = false } = {}) {
  const BASE = (base || process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(
    /\/$/,
    ''
  );
  const SENHA = senha || process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD || 'troque-esta-senha';

  let step = 0;
  const issues = [];

  const log = (msg) => console.log(`  ✓ ${msg}`);
  const skip = (msg) => console.log(`  ○ ${msg}`);
  const note = (msg) => {
    issues.push(msg);
    console.log(`  ⚠ ${msg}`);
  };
  const fail = (msg, detail) => {
    console.error(`\n  ✗ FALHOU no passo ${step}: ${msg}`);
    if (detail) console.error('   ', typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
    process.exit(1);
  };
  const bumpStep = () => {
    step += 1;
    return step;
  };

  function parseSetCookie(res) {
    if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
    const raw = res.headers.get('set-cookie');
    return raw ? [raw] : [];
  }
  function cookieHeader(setCookies) {
    return setCookies
      .map((c) => String(c).split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }

  /**
   * options.soft: em vez de abortar o processo em erro de rede/status
   * inesperado, registra um aviso (note) e devolve { res: null, ... }.
   * options.raw: não tenta fazer JSON.parse do corpo (usa o texto puro).
   */
  async function req(method, path, { body, cookie, expectStatus, soft = false, raw = false } = {}) {
    bumpStep();
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...(redirectManual ? { redirect: 'manual' } : {}),
      });
    } catch (e) {
      if (soft) {
        note(`rede ${method} ${path}: ${e.message}`);
        return { res: null, data: null, setCookie: [] };
      }
      fail(`rede ${method} ${path}`, e.message || e);
    }
    const text = await res.text();
    let data = null;
    if (!raw) {
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
    if (expectStatus != null && res.status !== expectStatus) {
      if (soft) {
        note(`${method} ${path} → HTTP ${res.status} (esperado ${expectStatus})`);
        return { res, data, setCookie: parseSetCookie(res) };
      }
      fail(`${method} ${path} → HTTP ${res.status} (esperado ${expectStatus})`, data);
    }
    return { res, data, setCookie: parseSetCookie(res) };
  }

  /**
   * login('admin') → cookie (string), como nos scripts atuais.
   * login('admin', { full: true }) → { cookie, staff, home }.
   * login('super', { senha: SUPER_SENHA }) → senha customizada.
   */
  async function login(usuario, { senha: senhaCustom, full = false } = {}) {
    const { data, setCookie } = await req('POST', '/api/login', {
      body: { usuario, senha: senhaCustom || SENHA },
      expectStatus: 200,
    });
    if (!data?.ok) fail(`login ${usuario}`, data);
    const cookie = cookieHeader(setCookie);
    if (!cookie) fail(`login ${usuario}: sem cookie de sessão`);
    log(`login ${usuario} → ${data.staff?.papel || '?'}`);
    return full ? { cookie, staff: data.staff, home: data.home } : cookie;
  }

  return {
    BASE,
    SENHA,
    issues,
    log,
    skip,
    note,
    fail,
    bumpStep,
    req,
    login,
    cookieHeader,
    parseSetCookie,
  };
}

module.exports = { criarCliente };
