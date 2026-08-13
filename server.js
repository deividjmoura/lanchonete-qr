require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { getCardapio } = require('./db/cardapio');
const {
  criarPedido,
  avancarStatus,
  getSessao,
  getFilaCozinha,
  getFilaGarcom,
  checkinCliente,
  ErroPedido,
} = require('./db/pedidos');
const {
  ErroAdmin,
  listMesas,
  getCardapioAdmin,
  criarCategoria,
  atualizarCategoria,
  criarProduto,
  atualizarProduto,
  criarAdicional,
  removerAdicional,
  setRemoviveis,
} = require('./db/admin');
const {
  listSessoesAbertas,
  fecharSessao,
  ErroCaixa,
} = require('./db/caixa');
const {
  SESSION_COOKIE,
  senhaConfigurada,
  senhaValida,
  criarSessao,
  destruirSessao,
  estaAutenticado,
  parseCookies,
  cookieDeSessao,
  cookieDeLogout,
} = require('./db/auth');
const { golpePermitido } = require('./db/rateLimit');
const { subscribe, broadcast } = require('./db/events');
const {
  ErroGarcom,
  listGarcons,
  criarGarcom,
  setGarcomAtivo,
  removerGarcom,
  getGarcomPorToken,
  entregarComoGarcom,
  listPedidosRecentes,
} = require('./db/garcons');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB = path.join(ROOT, 'data/db.json');

function db() {
  return JSON.parse(fs.readFileSync(DB, 'utf8'));
}
function save(x) {
  fs.writeFileSync(DB, JSON.stringify(x, null, 2));
}
function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const statuses = {
  PENDING: 'Pedido recebido',
  PREPARING: 'Na cozinha',
  READY: 'Pronto para entregar',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

const server = http.createServer(async (req, res) => {
  try {
    const u = url.parse(req.url, true);
    const p = u.pathname;

    // -----------------------------------------------------------------------
    // Rotas antigas (JSON) — continuam ativas até a UI ser migrada
    // -----------------------------------------------------------------------
    // Rotas legadas /api/menu e /api/orders (db.json) removidas — só Postgres.

    // -----------------------------------------------------------------------
    // Rotas Postgres
    // -----------------------------------------------------------------------
    if (p === '/api/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapio());
    }

    let m;
    // SSE — atualização em tempo quase real (cozinha, garçom, caixa, mesa)
    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      subscribe(res);
      // keepalive a cada 25s (proxies costumam cortar idle)
      const hb = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch (_) {
          clearInterval(hb);
        }
      }, 25000);
      req.on('close', () => clearInterval(hb));
      return;
    }

    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos$/)) && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (!golpePermitido(`pedido:${ip}:${m[1]}`, { janelaMs: 5 * 60 * 1000, max: 10 })) {
        return json(res, 429, { error: 'Muitos pedidos em pouco tempo. Aguarde um instante.' });
      }
      try {
        const pedido = await criarPedido(m[1], await body(req));
        broadcast('update', { type: 'pedido_criado', pedidoId: pedido.id, mesaToken: m[1] });
        return json(res, 201, pedido);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/checkin$/)) && req.method === 'POST') {
      try {
        const out = await checkinCliente(m[1], await body(req));
        broadcast('update', { type: 'checkin', mesaToken: m[1], clienteNome: out.clienteNome });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/sessao$/)) && req.method === 'GET') {
      try {
        return json(res, 200, await getSessao(m[1]));
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/garcom/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaGarcom());
    }
    // Garçom autenticado por token na URL (?token= ou path)
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/me$/)) && req.method === 'GET') {
      const g = await getGarcomPorToken(m[1]);
      if (!g || !g.ativo) return json(res, 401, { error: 'Link inválido ou desativado' });
      return json(res, 200, { id: g.id, nome: g.nome });
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos$/)) && req.method === 'GET') {
      const g = await getGarcomPorToken(m[1]);
      if (!g || !g.ativo) return json(res, 401, { error: 'Link inválido ou desativado' });
      return json(res, 200, await getFilaGarcom());
    }
    if ((m = p.match(/^\/api\/garcom\/([^/]+)\/pedidos\/(\d+)\/entregar$/)) && req.method === 'POST') {
      try {
        const out = await entregarComoGarcom(Number(m[2]), m[1]);
        broadcast('update', {
          type: 'status_alterado',
          pedidoId: Number(m[2]),
          status: 'entregue',
          garcom: out.garcom?.nome,
        });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // Autenticação (staff — admin/caixa)
    // -----------------------------------------------------------------------
    if (p === '/api/login' && req.method === 'POST') {
      if (!senhaConfigurada()) {
        return json(res, 500, { error: 'ADMIN_PASSWORD não configurada no servidor' });
      }
      const ip = req.socket.remoteAddress || 'unknown';
      if (!golpePermitido(`login:${ip}`, { janelaMs: 5 * 60 * 1000, max: 8 })) {
        return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      }
      const b = await body(req);
      if (!senhaValida(b.senha)) return json(res, 401, { error: 'Senha incorreta' });
      res.setHeader('Set-Cookie', cookieDeSessao(criarSessao()));
      return json(res, 200, { ok: true });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      destruirSessao(parseCookies(req)[SESSION_COOKIE]);
      res.setHeader('Set-Cookie', cookieDeLogout());
      return json(res, 200, { ok: true });
    }

    // Admin e caixa exigem sessão válida — checa antes de rotear pra eles
    if ((p.startsWith('/api/admin') || p.startsWith('/api/caixa') || p.startsWith('/api/cozinha') || (p.match(/^\/api\/pedidos\/\d+\/status$/) && req.method === 'PATCH')) && !estaAutenticado(req)) {
      return json(res, 401, { error: 'Não autenticado' });
    }

    if (p === '/api/cozinha/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaCozinha());
    }

    // -----------------------------------------------------------------------
    // Caixa (Postgres) — sessões abertas + fechar conta
    // -----------------------------------------------------------------------
    if (p === '/api/caixa/sessoes' && req.method === 'GET') {
      return json(res, 200, await listSessoesAbertas());
    }
    if ((m = p.match(/^\/api\/caixa\/sessoes\/(\d+)\/fechar$/)) && req.method === 'POST') {
      try {
        const out = await fecharSessao(Number(m[1]), await body(req));
        broadcast('update', { type: 'sessao_fechada', sessaoId: Number(m[1]) });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroCaixa) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/pedidos\/(\d+)\/status$/)) && req.method === 'PATCH') {
      try {
        const b = await body(req);
        const out = await avancarStatus(Number(m[1]), b.status);
        broadcast('update', { type: 'status_alterado', pedidoId: Number(m[1]), status: b.status });
        return json(res, 200, out);
      } catch (e) {
        if (e instanceof ErroPedido) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // Admin (Postgres) — passo 6 do plano
    // -----------------------------------------------------------------------
    if (p === '/api/admin/mesas' && req.method === 'GET') {
      return json(res, 200, await listMesas());
    }
    if (p === '/api/admin/garcons' && req.method === 'GET') {
      return json(res, 200, await listGarcons());
    }
    if (p === '/api/admin/garcons' && req.method === 'POST') {
      try {
        return json(res, 201, await criarGarcom(await body(req)));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        const b = await body(req);
        return json(res, 200, await setGarcomAtivo(Number(m[1]), b.ativo !== false));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/garcons\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        return json(res, 200, await removerGarcom(Number(m[1])));
      } catch (e) {
        if (e instanceof ErroGarcom) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/pedidos' && req.method === 'GET') {
      return json(res, 200, await listPedidosRecentes({ limit: 80 }));
    }
    if (p === '/api/admin/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapioAdmin());
    }
    if (p === '/api/admin/categorias' && req.method === 'POST') {
      try {
        return json(res, 201, await criarCategoria(await body(req)));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/categorias\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        return json(res, 200, await atualizarCategoria(Number(m[1]), await body(req)));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if (p === '/api/admin/produtos' && req.method === 'POST') {
      try {
        return json(res, 201, await criarProduto(await body(req)));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)$/)) && req.method === 'PATCH') {
      try {
        return json(res, 200, await atualizarProduto(Number(m[1]), await body(req)));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/adicionais$/)) && req.method === 'POST') {
      try {
        return json(res, 201, await criarAdicional(Number(m[1]), await body(req)));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/adicionais\/(\d+)$/)) && req.method === 'DELETE') {
      try {
        return json(res, 200, await removerAdicional(Number(m[1])));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }
    if ((m = p.match(/^\/api\/admin\/produtos\/(\d+)\/removiveis$/)) && req.method === 'PUT') {
      try {
        const b = await body(req);
        return json(res, 200, await setRemoviveis(Number(m[1]), b.ingredientes || b.removiveis || []));
      } catch (e) {
        if (e instanceof ErroAdmin) return json(res, e.status, { error: e.message });
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // Arquivos estáticos
    // -----------------------------------------------------------------------
    if ((p === '/admin' || p === '/caixa' || p === '/cozinha') && !estaAutenticado(req)) {
      res.writeHead(302, { Location: `/login?next=${encodeURIComponent(p)}` });
      return res.end();
    }
    let file = p === '/' ? '/index.html' : p;
    if (file.startsWith('/mesa/')) file = '/mesa.html';
    if (file.startsWith('/pedido/')) file = '/pedido.html';
    if (file === '/cozinha') file = '/cozinha.html';
    if (file === '/garcom' || /^\/garcom\/[0-9a-f-]{36}$/i.test(file)) file = '/garcom.html';
    if (file === '/caixa') file = '/caixa.html';
    if (file === '/admin') file = '/admin.html';
    if (file === '/login') file = '/login.html';
    const fp = path.join(ROOT, 'public', file);
    if (fs.existsSync(fp)) {
      return send(res, 200, mime[path.extname(fp)] || 'text/plain', fs.readFileSync(fp));
    }
    send(res, 404, 'text/plain', '404');
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`🍔 Lanchonete QR V2: http://localhost:${PORT}`));
