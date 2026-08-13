# 🍔 Lanchonete QR

Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

```text
Cliente (QR) → Pedido → Cozinha → Garçom → Conta da mesa → Caixa
```

---

## 📊 Status do projeto

| Área | Estado |
|------|:------:|
| Schema + migrations PostgreSQL | ✅ |
| Seed do cardápio (Hot Dogs → Sobremesas) | ✅ |
| Cardápio e pedidos (Postgres) | ✅ |
| Sessão / comanda acumulativa da mesa | ✅ |
| Check-in com nome do cliente | ✅ |
| Cozinha + avanço de status (auth) | ✅ |
| Garçom por link pessoal + lock otimista | ✅ |
| Caixa (fechar sessão + pagamento) | ✅ |
| Admin (cardápio, QR, garçons, pedidos) | ✅ |
| SSE em tempo quase real | ✅ |
| Rate limit (pedido + login) | ✅ |
| Tema conforme o dispositivo | ✅ |
| Rotas legadas `db.json` removidas | ✅ |
| `/` redireciona para `/admin` | ✅ |

---

## 🛠️ Stack

| Badge | Tecnologia | Uso |
|-------|------------|-----|
| ![Node](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=nodedotjs&logoColor=white) | **Node.js** | HTTP nativo (sem Express) |
| ![Postgres](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat&logo=postgresql&logoColor=white) | **PostgreSQL** | Dados operacionais (Neon ou local) |
| ![JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat&logo=javascript&logoColor=black) | **HTML / CSS / JS** | Front mobile-first, sem framework |
| ![SSE](https://img.shields.io/badge/Realtime-SSE-0EA5E9?style=flat) | **Server-Sent Events** | Atualização de filas e mesa |
| ![QR](https://img.shields.io/badge/QR-Token_UUID-111111?style=flat) | **QR por mesa** | Token opaco na URL |

**Dependências:** `pg` · `dotenv`

---

## 🔄 Fluxo operacional

```text
┌─────────────┐     ┌──────────┐     ┌─────────┐     ┌────────┐
│  Cliente    │────▶│ Cozinha  │────▶│ Garçom  │────▶│ Caixa  │
│ /mesa/:tok  │     │ (login)  │     │ /garcom │     │(login) │
└─────────────┘     └──────────┘     │ /:token │     └────────┘
       │                  │          └─────────┘           │
       │ check-in nome    │ status                         │ fecha
       │ + pedidos        │ recebido → concluido           │ sessão
       ▼                  ▼                                ▼
  Dock: sanduíche     Fila ao vivo                    Pagamento
  + sacola ($)         (SSE)                          libera mesa
```

| Papel | Como entra | O que faz |
|-------|------------|-----------|
| **Cliente** | QR da mesa | Nome → lousa → pedir → acompanhar total |
| **Cozinha** | Login staff | `recebido → em_producao → concluido` |
| **Garçom** | Link `/garcom/:token` | Entrega com assinatura e lock |
| **Caixa** | Login staff | Fecha sessão + pagamento |
| **Admin** | Login (`/` → `/admin`) | Cardápio, QR, garçons, pedidos |

---

## 🚀 Instalação

```bash
npm install
cp .env.example .env
# DATABASE_URL=...
# DATABASE_SSL=true
# ADMIN_PASSWORD=senha-do-staff

npm run db:migrate
npm run db:seed
# FORCE_SEED=1 npm run db:seed   # recria cardápio (apaga pedidos)

npm start
# http://localhost:3000  →  /admin (pede login)
```

| Script | Função |
|--------|--------|
| `npm start` | Sobe o servidor |
| `npm run db:migrate` | Migrations |
| `npm run db:seed` | Mesas + cardápio |

---

## 📱 Cliente (`/mesa/:token`)

- Cardápio em **lousa** com seções expansíveis
- **Check-in** com nome → mesa **ocupada** no admin
- Dock inferior:
  - **Sanduíche** → pedido (carrinho / enviar)
  - **Sacola com $** → modal da conta (itens, status, total)
- Tema automático (sistema)

---

## 🔌 API (resumo)

**Público:** `GET /api/events` · `GET /api/cardapio` · `POST /api/mesas/:token/checkin` · `GET .../sessao` · `POST .../pedidos` · rotas `/api/garcom/:token/*`

**Staff (após `/login`):** cozinha, `PATCH /api/pedidos/:id/status`, caixa, `/api/admin/*`

Telas protegidas: `/admin`, `/caixa`, `/cozinha`.

---

## 🔐 Segurança

- UUID na URL da mesa · preços no servidor · snapshot nos itens  
- Sessão única aberta por mesa · auth staff · rate limit  
- Entrega com lock otimista · legados `/api/orders` desligados  

---

## 📁 Estrutura

```text
├── db/           # migrations, pedidos, garcons, events, seed…
├── public/       # admin, mesa, cozinha, garcom, caixa, login, style.css
├── data/db.json  # só para seed
├── server.js
└── package.json
```

---

## 📄 Licença

Uso interno / educacional.
