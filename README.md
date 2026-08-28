# 🍔 Lanchonete QR

> Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

```text
Cliente (QR) ──▶ Pedido ──▶ Cozinha ──▶ Garçom ──▶ Conta da mesa ──▶ Caixa
```

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)
[![SSE](https://img.shields.io/badge/Realtime-SSE-0EA5E9?style=for-the-badge)](#)
[![Status](https://img.shields.io/badge/MVP_Core-78%25-22c55e?style=for-the-badge)](#-progresso-do-projeto)

---

## 📊 Progresso do projeto

### Visão geral

```text
████████████████████████████████░░░░░░░░  78%
│                 MVP Core                 │  Próxima fase
```

| Fase | Progresso | Status |
|------|:---------:|:------:|
| **MVP Core** (fluxo operacional completo) | `████████████████████ 100%` | ✅ Pronto |
| **Produção real** (auth, relatórios, estoque…) | `████░░░░░░░░░░░░░░░░  20%` | 🟡 Em definição |
| **Projeto geral** | `███████████████░░░░░  78%` | 🚀 Em evolução |

---

### ✅ O que já está pronto (MVP Core)

| Módulo | Detalhe | |
|--------|---------|:-:|
| Schema + migrations PostgreSQL | Neon / local, 4 migrations | ✅ |
| Seed do cardápio | Hot Dogs → Sobremesas + adicionais | ✅ |
| Cardápio e pedidos | Preços no servidor, snapshot nos itens | ✅ |
| Sessão / comanda acumulativa | Uma mesa, vários pedidos, total ao vivo | ✅ |
| Check-in do cliente | Nome → mesa ocupada | ✅ |
| Cozinha | Fila `recebido → em_producao → concluido` | ✅ |
| Garçom | Link pessoal + lock otimista na entrega | ✅ |
| Caixa | Fecha sessão + forma de pagamento | ✅ |
| Admin | Cardápio, QR, garçons, **painel de pedidos ativos** (histórico sob busca) | ✅ |
| Auth com papéis | `admin` / `cozinha` / `caixa` + sessão no Postgres | ✅ |
| Tempo real (SSE) | Atualiza filas e mesa sem refresh | ✅ |
| Rate limit | Pedido + login | ✅ |
| Segurança básica | UUID na mesa, headers, CSP, auth staff | ✅ |
| Tema automático | Segue o sistema do celular | ✅ |
| Mesa · personalizar | Adicionais, remoções, qtd e efeito no sanduíche | ✅ |

---

### 🟡 O que ainda falta (próxima fase)

Foco: tornar o sistema **pronto para uso diário** em uma lanchonete real.

| Prioridade | Item | Impacto | Estimativa |
|:----------:|------|---------|:----------:|
| 🟠 Média | **Dashboard do dia** (faturamento, top produtos, ticket médio) | Visão do negócio | Sprint 2 |
| 🟠 Média | **Estoque mínimo + esgotar produto** | Evita vender o que acabou | Sprint 3 |
| 🟡 Baixa | Impressão de comanda na cozinha | Operação mais rápida | Sprint 4 |
| 🟡 Baixa | Desconto / taxa de serviço no caixa | Flexibilidade na conta | Sprint 4 |
| 🟡 Baixa | Upload de foto dos produtos | Cardápio mais bonito | Sprint 4 |
| ⚪ Depois | Gateway de pagamento, delivery, multi-tenant | Escala | v3 |

```text
Próximos passos sugeridos
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Sprint 2   │──▶│  Sprint 3   │──▶│  Sprint 4   │
│  Dashboard  │   │   Estoque   │   │  Polimento  │
│  relatórios │   │  esgotar    │   │ print/desc. │
└─────────────┘   └─────────────┘   └─────────────┘
```

---

## 🔄 Fluxo operacional

```text
┌─────────────┐     ┌──────────┐     ┌─────────┐     ┌───────┐
│  Cliente    │────▶│ Cozinha  │────▶│ Garçom  │────▶│ Caixa  │
│ /mesa/:tok  │     │ (login)  │     │ /garcom │     │(login) │
└─────────────┘     └──────────┘     │ /:token │     └───────┘
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
| **Caixa** | Login staff | Fecha sessão + pagamento |
| **Admin** | Login (`/` → `/admin`) | Cardápio, QR, garçons, pedidos |

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

---

## 📱 Cliente (`/mesa/:token`)

- Cardápio em **lousa** com seções expansíveis
- **Check-in** com nome → mesa **ocupada** no admin
- **Adicionar** rápido ou **Personalizar** (adicionais, remoções, quantidade, observação)
- Dock inferior:
  - **Sanduíche** → pedido (carrinho / enviar) com animação ao adicionar
  - **Sacola com $** → modal da conta (itens, status, total)
- No carrinho: `−` / `+` para ajustar quantidade
- Tema automático (claro/escuro conforme o sistema)

---

## 🧾 Admin · Painel de pedidos

Aba **Pedidos** no `/admin`:

| Área | Comportamento |
|------|----------------|
| **Pedidos ativos** | Kanban em 3 colunas: *Recebido* → *Na cozinha* → *Pronto*. Só status em andamento (não mostra `entregue`). Atualiza via SSE. |
| **Histórico** | Vazio por padrão. Carrega só quando você busca por intervalo de datas (`De` / `Até`). Evita poluir a tela com pedidos antigos. |

Mesmo espírito da fila do garçom/cozinha: o que importa agora fica em destaque; o restante só sob demanda.

---

## 🔌 API (resumo)

**Público**
- `GET /api/events` · `GET /api/cardapio`
- `POST /api/mesas/:token/checkin` · `GET .../sessao` · `POST .../pedidos`
- Rotas `/api/garcom/:token/*`

**Staff** (após `/login`)
- Cozinha · `PATCH /api/pedidos/:id/status` · Caixa · `/api/admin/*`
- `GET /api/admin/pedidos?ativos=1` — só pedidos em andamento (`recebido` / `em_producao` / `concluido`)
- `GET /api/admin/pedidos?from=YYYY-MM-DD&to=YYYY-MM-DD` — histórico por período

Telas protegidas: `/admin`, `/caixa`, `/cozinha`.

---

## 🔐 Segurança

- UUID na URL da mesa · preços sempre recalculados no servidor
- Snapshot de preço nos itens · sessão única aberta por mesa
- Auth staff com cookie HttpOnly · rate limit em pedido e login
- Entrega com lock otimista · headers de segurança (CSP, HSTS em prod)

> **Staff:** usuários `admin` / `cozinha` / `caixa` no Postgres (seed na 1ª subida). Senha inicial: `STAFF_SEED_PASSWORD` ou `ADMIN_PASSWORD`.

---

## 📁 Estrutura

```text
├── db/                 # migrations, pedidos, garçons, events, seed, auth…
├── public/             # admin, mesa, cozinha, garcom, caixa, login, style.css
├── data/db.json        # usado apenas no seed
├── qr/                 # imagens dos QR codes das mesas
├── server.js
├── package.json
├── PLANO.md            # histórico da evolução Postgres
└── README.md           # você está aqui
```

---

## 🗺️ Roadmap resumido

| Versão | Foco | Status |
|--------|------|:------:|
| **v2.0** | MVP Core (fluxo completo + Postgres + SSE) | ✅ |
| **v2.1** | Auth com papéis + sessão persistente | ✅ |
| **v2.2** | Dashboard e relatórios do dia | ⬜ |
| **v2.3** | Estoque mínimo + esgotar produto | ⬜ |
| **v2.4** | Polimento (print, desconto, fotos) | ⬜ |
| **v3** | Pagamentos, delivery, multi-loja | ⬜ |

---

## 📄 Licença

Uso interno / educacional.

---

<div align="center">

**Lanchonete QR** — do QR na mesa até o caixa, sem papel e sem complicação.

`Cliente → Cozinha → Garçom → Caixa`

</div>
