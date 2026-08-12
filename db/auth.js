// Autenticação de staff (admin/caixa) — sessão em memória via cookie httpOnly.
// Sem tabela de usuários: uma senha compartilhada (ADMIN_PASSWORD no .env) é
// suficiente pro tamanho da operação hoje. Se crescer pra múltiplos operadores
// com permissões diferentes, trocar por login por usuário + tabela `staff`.
const crypto = require('crypto');

const SESSION_COOKIE = 'lqr_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — cobre um turno inteiro

// token -> timestamp de expiração. Em memória de propósito: reiniciar o
// servidor derruba as sessões, o que é aceitável (basta logar de novo) e
// evita depender de mais infra pra um único processo.
const sessions = new Map();

class ErroAuth extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function senhaConfigurada() {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length > 0;
}

function senhaValida(candidata) {
  const esperada = process.env.ADMIN_PASSWORD || '';
  const a = Buffer.from(String(candidata || ''));
  const b = Buffer.from(esperada);
  // timingSafeEqual exige buffers do mesmo tamanho — comparar tamanho antes
  // já vaza 1 bit de informação (tamanho da senha), aceitável aqui.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function criarSessao() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function destruirSessao(token) {
  if (token) sessions.delete(token);
}

function sessaoValida(token) {
  if (!token) return false;
  const expira = sessions.get(token);
  if (!expira) return false;
  if (Date.now() > expira) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function estaAutenticado(req) {
  return sessaoValida(parseCookies(req)[SESSION_COOKIE]);
}

function cookieDeSessao(token) {
  const partes = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === 'production') partes.push('Secure');
  return partes.join('; ');
}

function cookieDeLogout() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

// housekeeping simples pra sessões expiradas não ficarem acumulando em memória
setInterval(() => {
  const agora = Date.now();
  for (const [token, expira] of sessions) {
    if (agora > expira) sessions.delete(token);
  }
}, 30 * 60 * 1000).unref();

module.exports = {
  ErroAuth,
  SESSION_COOKIE,
  senhaConfigurada,
  senhaValida,
  criarSessao,
  destruirSessao,
  estaAutenticado,
  parseCookies,
  cookieDeSessao,
  cookieDeLogout,
};
