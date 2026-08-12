# 🍔 Lanchonete QR

Sistema de pedidos por QR Code para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

Cliente escaneia o QR da mesa → monta o pedido com adicionais, remoções e ponto da carne → cozinha avança o status → garçom entrega → valor entra na **comanda acumulativa da mesa** → caixa fecha a conta.

---

## Status do projeto

| Área | Estado |
|------|--------|
| Schema + migrations PostgreSQL (Neon) | ✅ |
| Seed (mesas, categorias, produtos, adicionais, removíveis, ponto da carne) | ✅ |
| `GET /api/cardapio` | ✅ |
| `POST /api/mesas/:token/pedidos` + sessão da mesa | ✅ |
| `GET /api/mesas/:token/sessao` (total devido) | ✅ |
| `GET /api/cozinha/pedidos` + `PATCH /api/pedidos/:id/status` | ✅ |
| `GET /api/garcom/pedidos` + entrega (`entregue`) | ✅ |
| `GET /api/caixa/sessoes` + `POST .../fechar` | ✅ |
| **Admin** — CRUD cardápio + QR por token | ✅ |
| UI cliente (`mesa.html`) migrada para token + Postgres | ✅ |
| UI cozinha migrada | ✅ |
| Tela garçom | ✅ |
| Tela caixa + fechar sessão | ✅ |
| SSE no lugar de polling | ⏳ |
| Auth admin/caixa + rate limit | ⏳ |

As rotas antigas (`/api/menu`, `/api/orders*`) ainda existem até a migração completa da UI. Mesa, cozinha, garçom e caixa já usam Postgres.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Runtime | **Node.js** (HTTP nativo, sem Express) |
| Banco | **PostgreSQL** (Neon) |
| Driver | `pg` |
| Config | `dotenv` |
| Front | HTML + CSS + JS vanilla (mobile-first) |
| QR | Geração on-the-fly no admin (API pública) · script Python opcional |

---

## Fluxo operacional

```
Cliente (QR na mesa)
   │  /mesa/:token
   ▼
Cardápio (Postgres) → monta pedido → POST /api/mesas/:token/pedidos
   │
   ▼
COZINHA   recebido → em_producao → concluido
   │
   ▼
GARÇOM    concluido → entregue   (valor soma em mesa_sessoes.valor_total)
   │
   ▼
Cliente pode pedir de novo → conta da mesa acumula
   │
   ▼
CAIXA     fecha sessão + forma de pagamento
```

Ponto-chave: **vários pedidos por visita**. O que importa financeiramente é a **sessão/comanda da mesa**, não o pedido isolado.

---

## Instalação

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env
# Edite DATABASE_URL (string do Neon ou Postgres local)
# DATABASE_SSL=true se o provedor exigir SSL

# 3. Schema + dados iniciais
npm run db:migrate
npm run db:seed

# 4. Subir
npm start
# → http://localhost:3000
```

### Scripts

| Comando | O que faz |
|---------|-----------|
| `npm start` / `npm run dev` | Sobe o servidor |
| `npm run db:migrate` | Aplica migrations em `db/migrations/` |
| `npm run db:seed` | Popula mesas + cardápio a partir do JSON legado |
| `npm run qr` | Gera PNGs estáticos em `qr/` (legado; admin já gera QR dinâmico por token) |

---

## Rotas principais

### Público / operação (Postgres)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/cardapio` | Cardápio disponível (categorias → produtos → adicionais/removíveis) |
| `POST` | `/api/mesas/:token/pedidos` | Cria pedido, abre/reaproveita sessão, valida preço e regras no servidor |
| `GET` | `/api/mesas/:token/sessao` | Pedidos da sessão aberta + total devido |
| `GET` | `/api/cozinha/pedidos` | Fila `recebido` / `em_producao` |
| `GET` | `/api/garcom/pedidos` | Fila `concluido` (pronto para entregar) |
| `PATCH` | `/api/pedidos/:id/status` | Avança um passo: `recebido → em_producao → concluido → entregue` |
| `GET` | `/api/caixa/sessoes` | Sessões abertas com itens entregues e total |
| `POST` | `/api/caixa/sessoes/:id/fechar` | Fecha conta (`formaPagamento`) e libera mesa |

### Admin (Postgres)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/mesas` | Mesas com token, status e sessão aberta |
| `GET` | `/api/admin/cardapio` | Cardápio completo (inclui indisponíveis) |
| `POST` | `/api/admin/categorias` | Nova categoria |
| `PATCH` | `/api/admin/categorias/:id` | Atualiza categoria |
| `POST` | `/api/admin/produtos` | Novo produto |
| `PATCH` | `/api/admin/produtos/:id` | Atualiza produto (preço, disponibilidade, ponto da carne…) |
| `POST` | `/api/admin/produtos/:id/adicionais` | Adiciona adicional |
| `DELETE` | `/api/admin/adicionais/:id` | Remove adicional |
| `PUT` | `/api/admin/produtos/:id/removiveis` | Substitui lista de ingredientes removíveis |

### Telas

| URL | Papel |
|-----|--------|
| `/mesa/:token` | Cliente (hoje ainda aceita número legado via JSON) |
| `/cozinha` | Cozinha |
| `/admin` | Cardápio + QR por token |
| `/garcom` | Garçom — pedidos prontos → entregue |
| `/caixa` | Caixa — fecha sessão + pagamento |

---

## Segurança já aplicada

- Token UUID opaco na URL da mesa (não o número sequencial)
- Preço e regras de personalização **sempre recalculados no servidor**
- Snapshot de preço em `itens_pedido` / `itens_pedido_adicionais` (pedido antigo não muda se o cardápio mudar)
- Constraint de sessão única aberta por mesa (`uq_mesa_sessao_aberta`)

Pendente: autenticação no admin/caixa e rate limit no endpoint de pedido.

---

## Estrutura

```
├── db/
│   ├── migrations/     # 0001_init, 0002_ingredientes_ponto_carne
│   ├── admin.js        # CRUD cardápio + mesas
│   ├── cardapio.js     # leitura pública
│   ├── pedidos.js      # criar pedido, status, sessão, fila
│   ├── caixa.js        # sessões abertas + fechar conta
│   ├── queries.js      # helpers compartilhados
│   ├── pool.js
│   ├── migrate.js
│   └── seed.js
├── public/
│   ├── admin.html      # painel admin (Postgres)
│   ├── mesa.html       # cliente (ainda JSON legado)
│   ├── cozinha.html    # fila Postgres (recebido/em_producao)
│   ├── garcom.html     # fila Postgres (concluido → entregue)
│   ├── caixa.html      # sessões abertas + fechar conta
│   ├── pedido.html
│   └── style.css
├── data/db.json        # legado — será aposentado
├── server.js
└── package.json
```

---

## Próximos passos (ordem sugerida)

1. ~~Migrar `mesa.html`~~ ✅
2. ~~Migrar `cozinha.html`~~ ✅ — `GET /api/cozinha/pedidos` + `PATCH /api/pedidos/:id/status`
3. ~~Tela `/garcom`~~ ✅ — `GET /api/garcom/pedidos` + marcar `entregue`
4. ~~Tela `/caixa`~~ ✅ — `GET /api/caixa/sessoes` + `POST /api/caixa/sessoes/:id/fechar`
5. SSE, auth e desligar rotas/`db.json` antigos

---

## Licença

Uso interno / educacional. Ajuste conforme a necessidade do projeto.
