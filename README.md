# 🍔 Lanchonete QR

> Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

```text
Cliente (QR) ──▶ Pedido ──▶ Cozinha ──▶ Garçom ──▶ Conta da mesa ──▶ Caixa
```

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)
[![SSE](https://img.shields.io/badge/Realtime-SSE-0EA5E9?style=for-the-badge)](#)
[![Status](https://img.shields.io/badge/Projeto-90%25-22c55e?style=for-the-badge)](#-progresso-do-projeto)

---

## 📊 Progresso do projeto

### Visão geral

```text
████████████████████████████████████████░░░░  90%
│            Produção real              │  Polimento
```

| Fase | Progresso | Status |
|------|:---------:|:------:|
| **MVP Core** (fluxo operacional completo) | `████████████████████ 100%` | ✅ Pronto |
| **Produção real** (auth, dashboard, estoque, UI) | `████████████████░░░░  85%` | 🟢 Quase lá |
| **Projeto geral** | `██████████████████░░  90%` | 🚀 Em evolução |

---

### ✅ O que já está pronto

| Módulo | Detalhe | |
|--------|---------|:-:|
| Schema + migrations PostgreSQL | Neon / local, 6 migrations | ✅ |
| Seed do cardápio | Hot Dogs → Sobremesas + adicionais | ✅ |
| Cardápio e pedidos | Preços no servidor, snapshot nos itens | ✅ |
| Sessão / comanda acumulativa | Uma mesa, vários pedidos, total ao vivo | ✅ |
| Check-in do cliente | Nome → mesa ocupada | ✅ |
| Cozinha | Fila `recebido → em_producao → concluido` | ✅ |
| Garçom | Link pessoal + lock otimista na entrega | ✅ |
| Caixa | Fecha sessão + forma de pagamento + PIX | ✅ |
| Admin | Cardápio, QR, garçons, pedidos, kanban | ✅ |
| Tempo real (SSE) | Atualiza filas e mesa sem refresh | ✅ |
| Rate limit | Pedido + login | ✅ |
| Segurança básica | UUID na mesa, headers, CSP, auth staff | ✅ |
| **Auth com papéis** | admin / cozinha / caixa + sessão no Postgres | ✅ |
| **Dashboard do dia** | Faturamento, ticket médio, top produtos, operação | ✅ |
| **Relatório PDF + purge** | Vendas por período · limpar histórico fechado | ✅ |
| **Estoque mínimo** | Controlar, mínimo, esgotar por produto | ✅ |
| **Design System v2** | Tokens, identidade operacional + cardápio gastronômico | ✅ |

---

### 🟡 O que ainda falta (próxima fase)

Foco: polimento para uso diário e escala.

| Prioridade | Item | Impacto | Estimativa |
|:----------:|------|---------|:----------:|
| 🟠 Média | Impressão de comanda na cozinha | Operação mais rápida | Sprint 5 |
| 🟠 Média | Desconto / taxa de serviço no caixa | Flexibilidade na conta | Sprint 5 |
| 🟡 Baixa | Upload de foto dos produtos | Cardápio mais apetitoso | Sprint 5 |
| 🟡 Baixa | Aposentar rotas legadas e `data/db.json` | Código mais limpo | Sprint 5 |
| ⚪ Depois | Gateway de pagamento, delivery, multi-tenant | Escala | v3 |

```text
Linha do tempo
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  v2.0   │─▶│  v2.1   │─▶│  v2.2   │─▶│  v2.3   │─▶│  v2.4   │─▶│  v2.5   │
│ MVP Core│  │  Auth   │  │Dashboard│  │PDF/purge│  │ Estoque │  │ UI DS v2│
│   ✅    │  │   ✅    │  │   ✅    │  │   ✅    │  │   ✅    │  │   ✅    │
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
                                                                    │
                                                                    ▼
                                                              v2.6 polimento
                                                              v3  escala
```

---

## 🎨 Design System v2 (agosto/2026)

Redesign **somente visual** — nenhuma regra de negócio, API ou fluxo alterado.

| Ambiente | Identidade |
|----------|------------|
| **Sistema** (admin, cozinha, caixa, garçom) | SaaS operacional premium — neutros quentes, accent terracota |
| **Cardápio** (`/mesa/:token`) | Gastronômico — lousa chalk, CTAs quentes, desejo de pedir |

**Arquivos de estilo**

- `public/style.css` — tokens, base, botões, forms, badges, tipografia
- `public/style-ops.css` — KPI, kanban, cards de pedido, caixa, tracking

Tokens: backgrounds, borders, text, accent, semânticos, spacing, radius, shadows, transitions. Dark mode via `data-theme` / `prefers-color-scheme`.

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
| **Cliente** | QR da mesa | Nome → cardápio → pedir → acompanhar total |
| **Cozinha** | Login staff | `recebido → em_producao → concluido` |
| **Garçom** | Link `/garcom/:token` | Entrega com assinatura e lock |
| **Caixa** | Login staff | Fecha sessão + pagamento (incl. PIX) |
| **Admin** | Login (`/` → `/admin`) | Dashboard, cardápio, QR, garçons, pedidos |

---

## 🛠️ Stack

| Tecnologia | Uso |
|------------|-----|
| **Node.js 22+** | HTTP nativo (sem Express) |
| **PostgreSQL** (Neon ou local) | Dados operacionais |
| **HTML / CSS / JS vanilla** | Front mobile-first, sem framework |
| **Server-Sent Events** | Atualização de filas e mesa |
| **QR por mesa** | Token UUID opaco na URL |

**Dependências:** `pg` · `dotenv`

---

## 🚀 Instalação

```bash
npm install
cp .env.example .env
# DATABASE_URL=...
# DATABASE_SSL=true          # true em Neon / produção
# ADMIN_PASSWORD=sua-senha

npm run db:migrate
npm run db:seed
# FORCE_SEED=1 npm run db:seed   # recria cardápio (apaga pedidos)

npm start
# http://localhost:3000  →  /admin (pede login)
```

| Script | Função |
|--------|--------|
| `npm start` / `npm run dev` | Sobe o servidor |
| `npm run db:migrate` | Roda migrations |
| `npm run db:seed` | Mesas + cardápio |
| `npm run qr` | Gera imagens de QR (Python) |

**Usuários iniciais (após migrate/seed):** `admin`, `cozinha`, `caixa` (senha do seed / `ADMIN_PASSWORD`).

---

## 📱 Cliente (`/mesa/:token`)

- Cardápio em **lousa** com seções expansíveis
- **Check-in** com nome → mesa **ocupada** no admin
- Dock inferior:
  - **Sanduíche** → pedido (carrinho / enviar)
  - **Sacola com $** → modal da conta (itens, status, total)
- Personalizar: adicionais, remoções, observação / ponto da carne
- Tema automático (claro/escuro conforme o sistema)

---

## 📊 Admin · Dashboard

- KPIs do dia (faturamento, ticket médio, pedidos, mesas ocupadas) · SSE
- Top produtos e operação por status
- Relatório de vendas (PDF via impressão do navegador)
- Limpar histórico (só sessões **fechadas** antes da data)
- Kanban de pedidos ativos + histórico por período

---

## 📦 Estoque (v2.4)

No **Cardápio → Editar** produto:

| Campo | Uso |
|-------|-----|
| **Controlar estoque** | Liga validação e baixa automática |
| **Estoque atual** | Quantidade disponível |
| **Mínimo** | Alerta ⚠️ no admin se `estoque ≤ mínimo` |
| **Esgotar** | Zera estoque e marca indisponível |

Pedidos: com controle ativo, valida quantidade e decrementa; zerar → indisponível. Cardápio público omite item sem estoque.

```bash
npm run db:migrate   # inclui 0006_estoque.sql
```

---

## 🔌 API (resumo)

**Público**
- `GET /api/events` · `GET /api/cardapio`
- `POST /api/mesas/:token/checkin` · `GET .../sessao` · `POST .../pedidos`
- Rotas `/api/garcom/:token/*`

**Staff** (após `/login`)
- Cozinha · `PATCH /api/pedidos/:id/status` · Caixa · `/api/admin/*`
- `GET /api/admin/dashboard` · `GET /api/admin/relatorio?from=&to=`
- `POST /api/admin/historico/purge` `{ before, confirm }`
- `GET /api/admin/pedidos?ativos=1` · `?from=&to=`
- Produtos: `controlaEstoque`, `estoque`, `estoqueMinimo` no PATCH/POST

Telas protegidas: `/admin`, `/caixa`, `/cozinha`.

---

## 🔐 Segurança

- UUID na URL da mesa · preços sempre recalculados no servidor
- Snapshot de preço nos itens · sessão única aberta por mesa
- Auth staff com cookie HttpOnly · papéis no Postgres
- Rate limit em pedido e login
- Entrega com lock otimista · headers de segurança (CSP, HSTS em prod)

---

## 📁 Estrutura

```text
├── db/                 # migrations, pedidos, garçons, events, seed, auth…
├── public/
│   ├── style.css       # Design System — tokens + base
│   ├── style-ops.css   # KPI, kanban, caixa, tracking
│   ├── admin, mesa, cozinha, garcom, caixa, login…
│   └── js/             # realtime, safe-dom, admin-*
├── data/db.json        # usado apenas no seed
├── qr/                 # imagens dos QR codes das mesas
├── server.js
├── package.json
├── PLANO.md            # histórico da evolução Postgres
└── README.md           # você está aqui
```

---

## 🗺️ Roadmap e histórico de versões

| Versão | Foco | Status |
|--------|------|:------:|
| **v2.0** | MVP Core (fluxo completo + Postgres + SSE) | ✅ |
| **v2.1** | Auth com papéis + sessão persistente | ✅ |
| **v2.2** | Dashboard do dia | ✅ |
| **v2.3** | Relatório PDF + purge de histórico | ✅ |
| **v2.4** | Estoque mínimo + esgotar produto | ✅ |
| **v2.5** | Design System v2 (redesign visual completo) | ✅ |
| **v2.6** | Polimento (print, desconto, fotos, limpeza legada) | ⬜ |
| **v3** | Pagamentos, delivery, multi-loja | ⬜ |

### Changelog recente

| Data | Mudança |
|------|---------|
| 2026-08-29 | **v2.5** — Design System centralizado, identidade operacional + cardápio gastronômico |
| 2026-08-29 | **v2.4** — Estoque mínimo, controlar/esgotar no admin |
| 2026-08-29 | **v2.3** — Relatório PDF e purge de sessões fechadas |
| 2026-08-28 | **v2.2** — Dashboard do dia com KPIs e SSE |
| 2026-08-27 | **v2.1** — Auth admin/cozinha/caixa + sessão no Postgres |
| 2026-08 | **v2.0** — MVP Core estável (mesa → cozinha → garçom → caixa) |

---

## 📄 Licença

Uso interno / educacional.

---

<div align="center">

**Lanchonete QR** — do QR na mesa até o caixa, sem papel e sem complicação.

`Cliente → Cozinha → Garçom → Caixa`

</div>
