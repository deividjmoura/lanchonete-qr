#!/usr/bin/env node
/**
 * Smoke API multi-tenant (V3) — path /loja/{slug}, isolamento básico.
 *
 * Pré-requisitos:
 *   - servidor no ar (npm start) na branch v3-multi-tenant
 *   - migrations 0012+0013 + seed
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 npm run test:tenant
 *
 * Opcional:
 *   SUPER_ADMIN_LOGIN / SUPER_ADMIN_SENHA no .env para testar /super
 */
require('dotenv').config();

const BASE = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(
  /\/$/,
  ''
);
const SENHA = process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const SUPER_LOGIN = process.env.SUPER_ADMIN_LOGIN || 'super';
const SUPER_SENHA = process.env.SUPER_ADMIN_SENHA || process.env.SUPER_ADMIN_PASSWORD || '';

let step = 0;
const log = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  ○ ${msg}`);
const fail = (msg, detail) => {
  console.error(`\n  ✗ FALHOU no passo ${step}: ${msg}`);
  if (detail) {
    console.error('   ', typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }
  process.exit(1);
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

async function req(method, path, { body, cookie, expectStatus, raw = false } = {}) {
  step += 1;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
  } catch (e) {
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
    fail(`${method} ${path} → HTTP ${res.status} (esperado ${expectStatus})`, data);
  }
  return { res, data, setCookie: parseSetCookie(res) };
}

async function login(usuario, senha = SENHA) {
  const { data, setCookie } = await req('POST', '/api/login', {
    body: { usuario, senha },
    expectStatus: 200,
  });
  if (!data?.ok) fail(`login ${usuario}`, data);
  const cookie = cookieHeader(setCookie);
  if (!cookie) fail(`login ${usuario}: sem cookie`);
  log(`login ${usuario} → ${data.staff?.papel || '?'}`);
  return { cookie, staff: data.staff, home: data.home };
}

function extrairProdutos(cardapio) {
  const produtos = [];
  for (const cat of cardapio || []) {
    for (const p of cat.produtos || []) produtos.push(p);
  }
  return produtos;
}

async function main() {
  console.log(`\n🏢 Smoke TENANT (V3 API) · ${BASE}\n`);

  // 0. servidor
  {
    step += 1;
    try {
      const r = await fetch(BASE + '/api/config/pix');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      log('servidor responde');
    } catch (e) {
      fail('servidor inacessível — rode npm start', e.message);
    }
  }

  // 1. cardápio legado (padrao)
  const { data: cardapioLegado } = await req('GET', '/api/cardapio', { expectStatus: 200 });
  const prodsLegado = extrairProdutos(cardapioLegado);
  if (!prodsLegado.length) fail('cardápio legado vazio — rode seed');
  log(`cardápio legado · ${prodsLegado.length} produto(s)`);

  // 2. cardápio por slug padrao
  const { data: cardapioSlug } = await req('GET', '/api/loja/padrao/cardapio', { expectStatus: 200 });
  const prodsSlug = extrairProdutos(cardapioSlug);
  if (!prodsSlug.length) fail('cardápio /loja/padrao vazio');
  log(`cardápio /loja/padrao · ${prodsSlug.length} produto(s)`);

  // 3. slug inexistente
  await req('GET', '/api/loja/loja-que-nao-existe/cardapio', { expectStatus: 404 });
  log('slug inexistente → 404');

  // 4. login staff loja
  const { cookie: cookieAdmin, staff: adminStaff } = await login('admin');
  if (adminStaff?.papel !== 'admin') fail('papel admin', adminStaff);
  if (adminStaff?.estabelecimentoId == null) fail('admin sem estabelecimentoId', adminStaff);
  log(`admin.estabelecimentoId = ${adminStaff.estabelecimentoId}`);

  // 5. mesas com slug
  const { data: mesas } = await req('GET', '/api/admin/mesas', {
    cookie: cookieAdmin,
    expectStatus: 200,
  });
  if (!Array.isArray(mesas) || !mesas.length) fail('sem mesas', mesas);
  const mesa = mesas[0];
  if (!mesa.token) fail('mesa sem token', mesa);
  if (!mesa.slug) fail('mesa sem slug (esperado após #30)', mesa);
  log(`mesa ${mesa.numero} · slug=${mesa.slug} · token ok`);

  const token = mesa.token;
  const slug = mesa.slug;
  const produto = prodsSlug.find((p) => p.disponivel !== false) || prodsSlug[0];
  const produtoId = produto.id;

  // 6. HTML redirect legado /mesa/{token} → /loja/{slug}/mesa/{token}
  {
    const { res } = await req('GET', `/mesa/${token}`, { expectStatus: 302, raw: true });
    const loc = res.headers.get('location') || '';
    if (!loc.includes(`/loja/${slug}/mesa/${token}`)) {
      fail('redirect legado incorreto', loc);
    }
    log(`redirect /mesa/{token} → ${loc}`);
  }

  // 7. HTML path correto (200)
  {
    const { res } = await req('GET', `/loja/${slug}/mesa/${token}`, {
      expectStatus: 200,
      raw: true,
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) fail('mesa page não é html', ct);
    log('GET /loja/{slug}/mesa/{token} → 200 HTML');
  }

  // 8. API mesa com slug correto
  const { data: sessao } = await req('GET', `/api/loja/${slug}/mesas/${token}/sessao`, {
    expectStatus: 200,
  });
  if (sessao == null || sessao.mesa == null) fail('sessão inválida', sessao);
  log(`sessão API slug ok · mesa ${sessao.mesa}`);

  // 9. API mesa com slug ERRADO → 403
  await req('GET', `/api/loja/outro-slug-falso/mesas/${token}/sessao`, { expectStatus: 403 });
  log('slug × mesa mismatch → 403');

  // 10. pedido via path com slug
  const { data: pedido } = await req('POST', `/api/loja/${slug}/mesas/${token}/pedidos`, {
    body: {
      clienteNome: 'Smoke Tenant',
      items: [{ productId: produtoId, qty: 1 }],
    },
    expectStatus: 201,
  });
  if (!pedido?.id) fail('criar pedido', pedido);
  log(`pedido #${pedido.id} via /api/loja/...`);

  // 11. cozinha vê o pedido
  const { cookie: cookieCozinha } = await login('cozinha');
  const { data: fila } = await req('GET', '/api/cozinha/pedidos', {
    cookie: cookieCozinha,
    expectStatus: 200,
  });
  const naFila = (fila || []).some((p) => p.id === pedido.id);
  if (!naFila) fail('pedido não apareceu na cozinha', fila);
  log('pedido na fila da cozinha');

  // 12. caixa lista sessões (sem erro SQL)
  const { cookie: cookieCaixa } = await login('caixa');
  const { data: sessoes } = await req('GET', '/api/caixa/sessoes', {
    cookie: cookieCaixa,
    expectStatus: 200,
  });
  if (!Array.isArray(sessoes)) fail('caixa sessoes não é array', sessoes);
  log(`caixa · ${sessoes.length} sessão(ões) aberta(s)`);

  // 13. super_admin (opcional)
  if (SUPER_SENHA) {
    const { cookie: cookieSuper, staff: superStaff, home } = await login(SUPER_LOGIN, SUPER_SENHA);
    if (superStaff?.papel !== 'super_admin') fail('papel super', superStaff);
    if (superStaff?.estabelecimentoId != null) fail('super deve ter estabelecimentoId null', superStaff);
    if (home !== '/super') fail('home super', home);
    await req('GET', '/api/super/me', { cookie: cookieSuper, expectStatus: 200 });
    log('super_admin · /api/super/me ok');
    // admin da loja não acessa super API
    await req('GET', '/api/super/me', { cookie: cookieAdmin, expectStatus: 403 });
    log('admin da loja bloqueado em /api/super/me');
  } else {
    skip('SUPER_ADMIN_SENHA não definida — pulando testes de super');
  }

  console.log('\n✅ Smoke TENANT OK — path /loja/{slug} e isolamento básico ok.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
