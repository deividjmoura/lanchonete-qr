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
    if (p === '/api/menu') return json(res, 200, db().menu);
    if (p === '/api/orders' && req.method === 'GET')
      return json(res, 200, db().orders.slice().reverse());
    if (p === '/api/orders' && req.method === 'POST') {
      const b = await body(req);
      const d = db();
      const input = Array.isArray(b.items) ? b.items : [];
      let total = 0;
      const out = [];
      for (const i of input) {
        const m = d.menu.find((x) => x.id === Number(i.productId ?? i.id));
        if (!m) continue;
        const q = Math.max(1, Math.min(99, Number(i.qty) || 1));
        const c = m.customization || {};
        const selectedAdds = Array.isArray(i.additions) ? i.additions : [];
        const additions = [];
        for (const a of selectedAdds) {
          const allowed = (c.additions || []).find((x) => x.id === a.id);
          if (allowed) additions.push({ id: allowed.id, name: allowed.name, price: allowed.price });
        }
        const removals = [
          ...new Set(
            (Array.isArray(i.removals) ? i.removals : []).filter((x) => (c.removals || []).includes(x))
          ),
        ];
        const meatPoint =
          c.meatPoint && ['MAL_PASSADO', 'AO_PONTO', 'BEM_PASSADO'].includes(i.meatPoint)
            ? i.meatPoint
            : null;
        const note = String(i.note || '').trim().slice(0, 300);
        const unit = m.price + additions.reduce((s, a) => s + a.price, 0);
        total += unit * q;
        out.push({
          id: m.id,
          name: m.name,
          qty: q,
          price: m.price,
          additions,
          removals,
          meatPoint,
          note,
          unitTotal: unit,
        });
      }
      if (!out.length) return json(res, 400, { error: 'O pedido está vazio' });
      const o = {
        id: d.nextOrder++,
        table: Number(b.table) || 1,
        status: 'PENDING',
        statusLabel: statuses.PENDING,
        note: String(b.note || '').trim().slice(0, 500),
        items: out,
        total: Number(total.toFixed(2)),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      d.orders.push(o);
      save(d);
      return json(res, 201, o);
    }
    if (p.startsWith('/api/orders/') && req.method === 'GET') {
      const id = Number(p.split('/').pop());
      const o = db().orders.find((x) => x.id === id);
      if (!o) return json(res, 404, { error: 'Pedido não encontrado' });
      return json(res, 200, o);
    }
    if (p.startsWith('/api/orders/') && req.method === 'PATCH') {
      const id = Number(p.split('/').pop());
      const b = await body(req);
      const d = db();
      const o = d.orders.find((x) => x.id === id);
      if (!o) return json(res, 404, { error: 'Pedido não encontrado' });
      if (!statuses[b.status]) return json(res, 400, { error: 'Status inválido' });
      o.status = b.status;
      o.statusLabel = statuses[b.status];
      o.updatedAt = new Date().toISOString();
      save(d);
      return json(res, 200, o);
    }

    // -----------------------------------------------------------------------
    // Rotas novas (Postgres) — convivem com as antigas até a UI migrar
    // -----------------------------------------------------------------------
    if (p === '/api/cardapio' && req.method === 'GET') {
      return json(res, 200, await getCardapio());
    }

    let m;
    if ((m = p.match(/^\/api\/mesas\/([^/]+)\/pedidos$/)) && req.method === 'POST') {
      try {
        return json(res, 201, await criarPedido(m[1], await body(req)));
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
    if (p === '/api/cozinha/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaCozinha());
    }
    if (p === '/api/garcom/pedidos' && req.method === 'GET') {
      return json(res, 200, await getFilaGarcom());
    }
    if ((m = p.match(/^\/api\/pedidos\/(\d+)\/status$/)) && req.method === 'PATCH') {
      try {
        const b = await body(req);
        return json(res, 200, await avancarStatus(Number(m[1]), b.status));
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
    let file = p === '/' ? '/index.html' : p;
    if (file.startsWith('/mesa/')) file = '/mesa.html';
    if (file.startsWith('/pedido/')) file = '/pedido.html';
    if (file === '/cozinha') file = '/cozinha.html';
    if (file === '/garcom') file = '/garcom.html';
    if (file === '/admin') file = '/admin.html';
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
