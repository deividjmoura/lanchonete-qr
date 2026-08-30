#!/usr/bin/env node
/**
 * Smoke test — fluxo completo da lanchonete.
 *
 * Pré-requisitos:
 *   - servidor rodando (npm start)
 *   - banco migrado + seed (npm run db:migrate && npm run db:seed)
 *   - STAFF_SEED_PASSWORD no .env (default: troque-esta-senha)
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 npm run test:smoke
 *
 * Exit 0 = feliz · Exit 1 = alguém quebrou o hambúrguer no meio do caminho.
 */
require('dotenv').config();

const BASE = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
const SENHA = process.env.STAFF_SEED_PASSWORD || process.env.ADMIN_PASSWORD || 'troque-esta-senha';

let step = 0;
const log = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, detail) => {
  console.error(`\n  ✗ FALHOU no passo ${step}: ${msg}`);
  if (detail) console.error('   ', typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  process.exit(1);
};

function parseSetCookie(res) {
  // Node 18+ fetch: headers.getSetCookie() ou fallback
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie();
  }
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function cookieHeader(setCookies) {
  return setCookies
    .map((c) => String(c).split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function req(method, path, { body, cookie, expectStatus } = {}) {
  step += 1;
  const url = BASE + path;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`rede ${method} ${path}`, e.message || e);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (expectStatus != null && res.status !== expectStatus) {
    fail(`${method} ${path} → HTTP ${res.status} (esperado ${expectStatus})`, data);
  }
  return { res, data, setCookie: parseSetCookie(res) };
}

async function login(usuario) {
  const { data, setCookie, res } = await req('POST', '/api/login', {
    body: { usuario, senha: SENHA },
    expectStatus: 200,
  });
  if (!data || !data.ok) fail(`login ${usuario}`, data);
  const cookie = cookieHeader(setCookie);
  if (!cookie) fail(`login ${usuario}: sem cookie de sessão`);
  log(`login ${usuario} → ${data.staff?.papel || '?'}`);
  return cookie;
}

async function main() {
  console.log(`\n🍔 Smoke Lanchonete QR · ${BASE}\n`);

  // 0. servidor vivo?
  {
    step += 1;
    try {
      const r = await fetch(BASE + '/api/config/pix');
      if (!r.ok && r.status !== 200) throw new Error('HTTP ' + r.status);
      log('servidor responde');
    } catch (e) {
      fail('servidor inacessível — rode npm start antes', e.message);
    }
  }

  // 1. cardápio público
  const { data: cardapio } = await req('GET', '/api/cardapio', { expectStatus: 200 });
  const produtos = [];
  if (Array.isArray(cardapio)) {
    for (const cat of cardapio) {
      for (const p of cat.produtos || cat.items || []) produtos.push(p);
    }
  } else if (cardapio && Array.isArray(cardapio.categorias)) {
    for (const cat of cardapio.categorias) {
      for (const p of cat.produtos || []) produtos.push(p);
    }
  } else if (cardapio && Array.isArray(cardapio.menu)) {
    for (const p of cardapio.menu) produtos.push(p);
  }
  // formato real: ver db/cardapio.js
  if (!produtos.length && cardapio) {
    // tenta achar qualquer produto com id/preco
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o.id && (o.preco != null || o.price != null) && (o.nome || o.name)) {
        produtos.push(o);
        return;
      }
      Object.values(o).forEach(walk);
    };
    walk(cardapio);
  }
  if (!produtos.length) fail('cardápio vazio — rode npm run db:seed');
  const produto = produtos.find((p) => p.disponivel !== false) || produtos[0];
  const produtoId = produto.id || produto.productId;
  const preco = Number(produto.preco ?? produto.price ?? 0);
  log(`produto #${produtoId} · ${produto.nome || produto.name} · R$ ${preco.toFixed(2)}`);

  // 2. auth admin / cozinha / caixa
  const cookieAdmin = await login('admin');
  const cookieCozinha = await login('cozinha');
  const cookieCaixa = await login('caixa');

  // 3. mesa livre
  const { data: mesas } = await req('GET', '/api/admin/mesas', {
    cookie: cookieAdmin,
    expectStatus: 200,
  });
  if (!Array.isArray(mesas) || !mesas.length) fail('nenhuma mesa cadastrada');
  // prefere mesa sem sessão aberta; senão usa a primeira
  const mesa =
    mesas.find((m) => !m.sessaoAberta && m.status !== 'ocupada') || mesas[0];
  if (!mesa.token) fail('mesa sem token', mesa);
  log(`mesa ${mesa.numero} · token …${String(mesa.token).slice(-8)}`);

  // se já tem sessão aberta, tenta fechar antes (limpa o terreno)
  if (mesa.sessaoAberta && mesa.sessaoId) {
    // pode ter pedidos pendentes — smoke assume ambiente de teste
    log(`mesa já tinha sessão #${mesa.sessaoId} (pode falhar se houver pedidos em andamento)`);
  }

  // 4. garçom de teste
  let { data: garcons } = await req('GET', '/api/admin/garcons', {
    cookie: cookieAdmin,
    expectStatus: 200,
  });
  let garcom = (garcons || []).find((g) => g.ativo);
  if (!garcom) {
    const created = await req('POST', '/api/admin/garcons', {
      cookie: cookieAdmin,
      body: { nome: 'Smoke Tester' },
      expectStatus: 201,
    });
    garcom = created.data;
    log(`garçom criado #${garcom.id}`);
  } else {
    log(`garçom ${garcom.nome} · token …${String(garcom.token).slice(-8)}`);
  }
  if (!garcom.token) fail('garçom sem token', garcom);

  // 5. pedido na mesa
  const { data: pedido } = await req('POST', `/api/mesas/${mesa.token}/pedidos`, {
    body: {
      clienteNome: 'Smoke Client',
      items: [{ productId: produtoId, qty: 1 }],
    },
    expectStatus: 201,
  });
  if (!pedido || !pedido.id) fail('pedido sem id', pedido);
  log(`pedido #${pedido.id} criado · status ${pedido.status}`);

  // 6. cozinha: recebido → em_producao → concluido
  await req('PATCH', `/api/pedidos/${pedido.id}/status`, {
    cookie: cookieCozinha,
    body: { status: 'em_producao' },
    expectStatus: 200,
  });
  log('cozinha: em_producao');

  await req('PATCH', `/api/pedidos/${pedido.id}/status`, {
    cookie: cookieCozinha,
    body: { status: 'concluido' },
    expectStatus: 200,
  });
  log('cozinha: concluido');

  // 7. garçom entrega
  const { data: entrega } = await req(
    'POST',
    `/api/garcom/${garcom.token}/pedidos/${pedido.id}/entregar`,
    { expectStatus: 200 }
  );
  if (!entrega || entrega.status !== 'entregue') fail('entrega falhou', entrega);
  log(`garçom entregou · ${entrega.garcom?.nome || garcom.nome}`);

  // 8. sessão deve ter valor > 0
  const { data: sessao } = await req('GET', `/api/mesas/${mesa.token}/sessao`, {
    expectStatus: 200,
  });
  const total = Number(sessao.totalDevido || 0);
  if (total <= 0) fail('total devido zerado após entrega', sessao);
  log(`conta mesa · total R$ ${total.toFixed(2)}`);

  // 9. cliente avisa PIX (não baixa valor — só notifica)
  const { data: pix } = await req('POST', `/api/mesas/${mesa.token}/pix-informado`, {
    expectStatus: 200,
  });
  if (!pix || !pix.ok) fail('pix-informado', pix);
  if (Number(pix.valorRestante) <= 0) fail('pix-informado zerou o restante (não deveria)', pix);
  log(`PIX informado · restante R$ ${Number(pix.valorRestante).toFixed(2)}`);

  // 10. segundo aviso PIX (divisão — não pode travar)
  const { data: pix2 } = await req('POST', `/api/mesas/${mesa.token}/pix-informado`, {
    expectStatus: 200,
  });
  if (!pix2 || !pix2.ok) fail('segundo pix-informado travou', pix2);
  log('segundo aviso PIX ok (divisão na mesa)');

  // 11. caixa: sessões abertas + pagamento parcial + fechar
  const { data: sessoes } = await req('GET', '/api/caixa/sessoes', {
    cookie: cookieCaixa,
    expectStatus: 200,
  });
  const aberta = (sessoes || []).find((s) => s.id === sessao.sessaoId || s.mesa === mesa.numero);
  if (!aberta) fail('sessão não aparece no caixa', { sessaoId: sessao.sessaoId, sessoes });
  const sessaoId = aberta.id;
  const restante = Number(aberta.valorRestante != null ? aberta.valorRestante : aberta.valorTotal);
  log(`caixa vê sessão #${sessaoId} · restante R$ ${restante.toFixed(2)}`);

  // parcial: metade (mín. 0.01)
  const metade = Number(Math.max(0.01, Math.floor(restante * 50) / 100).toFixed(2));
  const { data: parcial } = await req('POST', `/api/caixa/sessoes/${sessaoId}/pagamentos`, {
    cookie: cookieCaixa,
    body: { valor: metade, formaPagamento: 'pix' },
    expectStatus: 201,
  });
  if (!parcial || !parcial.ok) fail('pagamento parcial', parcial);
  log(`parcial R$ ${metade.toFixed(2)} · resta R$ ${Number(parcial.valorRestante).toFixed(2)}`);

  // fechar (quita o resto)
  const { data: fechada } = await req('POST', `/api/caixa/sessoes/${sessaoId}/fechar`, {
    cookie: cookieCaixa,
    body: { formaPagamento: 'dinheiro', desconto: 0, taxaServico: 0 },
    expectStatus: 200,
  });
  if (!fechada || fechada.status !== 'fechada') fail('fechar sessão', fechada);
  log(`conta fechada · cobrado R$ ${Number(fechada.valorCobrado ?? fechada.valorTotal).toFixed(2)}`);

  // 12. mesa livre de novo?
  const { data: mesas2 } = await req('GET', '/api/admin/mesas', {
    cookie: cookieAdmin,
    expectStatus: 200,
  });
  const mesaDepois = (mesas2 || []).find((m) => m.id === mesa.id);
  if (mesaDepois && mesaDepois.sessaoAberta) {
    fail('mesa ainda com sessão aberta após fechar', mesaDepois);
  }
  log(`mesa ${mesa.numero} liberada`);

  console.log('\n✅ Smoke OK — o hambúrguer sobreviveu ao labirinto.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
