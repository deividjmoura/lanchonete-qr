/**
 * Otimização de fotos de cardápio.
 * Redimensiona (máx 480px no lado maior) e grava WebP leve em public/uploads/.
 * Serve bem thumbs no celular sem pesar o banco (só o path) nem a lista do cardápio.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAX_EDGE = Number(process.env.FOTO_MAX_EDGE || 480);
const WEBP_QUALITY = Number(process.env.FOTO_WEBP_QUALITY || 72);
const MAX_INPUT_BYTES = Number(process.env.FOTO_MAX_INPUT_BYTES || 6 * 1024 * 1024);
const FETCH_TIMEOUT_MS = 12_000;

class ErroFoto extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function ensureUploadDir() {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
}

function bufferFromBase64(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new ErroFoto(400, 'Imagem em base64 inválida');
  }
  let b64 = raw.trim();
  const m = b64.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (m) b64 = m[1];
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw new ErroFoto(400, 'Base64 inválido');
  }
  if (!buf.length) throw new ErroFoto(400, 'Imagem vazia');
  if (buf.length > MAX_INPUT_BYTES) {
    throw new ErroFoto(413, 'Imagem muito grande (máx ~6 MB)');
  }
  return buf;
}

async function fetchUrlBuffer(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) {
    throw new ErroFoto(400, 'URL deve começar com http:// ou https://');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LanchoneteQR-Foto/1.0', Accept: 'image/*' },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new ErroFoto(400, 'Não foi possível baixar a imagem (HTTP ' + res.status + ')');
    }
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype && !ctype.startsWith('image/') && !ctype.includes('octet-stream')) {
      throw new ErroFoto(400, 'A URL não aponta para uma imagem');
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_INPUT_BYTES) {
      throw new ErroFoto(413, 'Imagem remota muito grande');
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > MAX_INPUT_BYTES) {
      throw new ErroFoto(413, 'Imagem remota muito grande');
    }
    if (!buf.length) throw new ErroFoto(400, 'Imagem remota vazia');
    return buf;
  } catch (e) {
    if (e instanceof ErroFoto) throw e;
    if (e && e.name === 'AbortError') {
      throw new ErroFoto(408, 'Tempo esgotado ao baixar a imagem');
    }
    throw new ErroFoto(400, 'Falha ao baixar a imagem: ' + (e.message || 'erro de rede'));
  } finally {
    clearTimeout(t);
  }
}

async function otimizarBuffer(buf) {
  try {
    return await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch (e) {
    throw new ErroFoto(400, 'Arquivo de imagem inválido ou corrompido');
  }
}

async function salvarFotoOtimizada(buf) {
  await ensureUploadDir();
  const out = await otimizarBuffer(buf);
  const name = crypto.randomBytes(12).toString('hex') + '.webp';
  const fp = path.join(UPLOAD_DIR, name);
  await fs.promises.writeFile(fp, out);
  return {
    fotoUrl: '/uploads/' + name,
    bytes: out.length,
    widthMax: MAX_EDGE,
    format: 'webp',
  };
}

/**
 * body: { url?: string, data?: string (base64 ou data-URL) }
 */
async function processarUploadFoto(body) {
  body = body || {};
  let buf = null;
  if (body.data) {
    buf = bufferFromBase64(body.data);
  } else if (body.url) {
    buf = await fetchUrlBuffer(body.url);
  } else {
    throw new ErroFoto(400, 'Envie um arquivo (data) ou uma URL de imagem');
  }
  return salvarFotoOtimizada(buf);
}

/** Remove arquivo local antigo se for /uploads/... (não apaga URLs externas). */
async function tentarRemoverUploadLocal(fotoUrl) {
  if (!fotoUrl || typeof fotoUrl !== 'string') return;
  if (!fotoUrl.startsWith('/uploads/')) return;
  const base = path.basename(fotoUrl);
  if (!/^[a-f0-9]+\.webp$/i.test(base)) return;
  const fp = path.join(UPLOAD_DIR, base);
  try {
    await fs.promises.unlink(fp);
  } catch (_) {}
}

module.exports = {
  ErroFoto,
  processarUploadFoto,
  salvarFotoOtimizada,
  tentarRemoverUploadLocal,
  UPLOAD_DIR,
};
