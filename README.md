# 🍔 Lanchonete QR

> Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

```text
Cliente (QR) ──▶ Pedido ──▶ Cozinha ──▶ Garçom ──▶ Conta da mesa ──▶ Caixa
```

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)
[![SSE](https://img.shields.io/badge/Realtime-SSE-0EA5E9?style=for-the-badge)](#)
[![Status](https://img.shields.io/badge/Projeto-92%25-22c55e?style=for-the-badge)](#-progresso-do-projeto)
[![Próximo](https://img.shields.io/badge/v2.6-em_andamento-f59e0b?style=for-the-badge)](#-próxima-fase--v26-polimento)

---

## 📊 Progresso do projeto

### Visão geral

```text
█████████████████████████████████████████░░░  92%
│            Produção real               │ Polimento
```

| Fase | Progresso | Status |
|------|:---------:|:------:|
| **MVP Core** (fluxo operacional completo) | `████████████████████ 100%` | ✅ Pronto |
| **Produção real** (auth, dashboard, estoque, UI) | `█████████████████░░░  88%` | 🟢 Quase lá |
| **Projeto geral** | `██████████████████░░  92%` | 🚀 Em evolução |

---

### ✅ O que já está pronto

| Módulo | Detalhe | |
|--------|---------|:-:|
| Schema + migrations PostgreSQL | Neon / local, **7** migrations | ✅ |
| Seed do cardápio | Hot Dogs → Sobremesas + adicionais | ✅ |
| Cardápio e pedidos | Preços no servidor, snapshot nos itens | ✅ |
| Sessão / comanda acumulativa | Uma mesa, vários pedidos, total ao vivo | ✅ |
| Check-in do cliente | Nome → mesa ocupada | ✅ |
| Cozinha | Fila + **impressão de comanda** | ✅ |
| Garçom | Link pessoal + lock otimista na entrega | ✅ |
| Caixa | Fecha sessão + PIX + **desconto / taxa de serviço** | ✅ |
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

## 🎯 Fase v2.6 — Polimento

| Item | Status |
|------|:------:|
| **Impressão de comanda** na cozinha (browser / térmica) | ✅ |
| **Desconto / taxa de serviço** no caixa (`valor_cobrado`) | ✅ |
| **Fotos dos produtos** no cardápio | ⬜ |
| **Limpeza legada** — rotas antigas e `data/db.json` | ⬜ |

```bash
npm run db:migrate   # inclui 0007_desconto_taxa.sql
```

**Cozinha:** botão **Imprimir** em cada pedido → ticket 72mm (mesa, cliente, itens, extras, obs.).

**Caixa:** campos **Desconto (R$)** e **Taxa de serviço (R$)**; “A cobrar” atualiza ao vivo; PIX usa o valor cobrado; ao fechar grava `desconto`, `taxa_servico`, `valor_cobrado`.

---

## 💡 Ideias futuras — pagamento e divisão de conta

> **Não entram no v2.6.** Registradas para pós-polimento / v2.7+.

| Tema | Ideia |
|------|--------|
| **Onde dividir** | Preferência: **só no caixa** no primeiro momento |
| **Nomes nos pedidos** | Caixa vê consumo por pessoa |
| **Fechamento em partes** | Pagar tudo · dividir igual · valores manuais · várias formas |
| **Preferência do cliente** | Após pedido: mesa vs caixa; PIX + WhatsApp com local/unidade |

---

## 🎨 Design System v2 (agosto/2026)

| Ambiente | Identidade |
|----------|------------|
| **Sistema** (admin, cozinha, caixa, garçom) | SaaS operacional — neutros quentes, accent terracota |
| **Cardápio** (`/mesa/:token`) | Gastronômico — lousa chalk |

- `public/style.css` — tokens + base
- `public/style-ops.css` — KPI, kanban, caixa, tracking

---

## 🔄 Fluxo operacional

```text
Cliente (/mesa/:tok) → Cozinha → Garçom → Caixa (fecha + pagamento)
```

| Papel | Como entra | O que faz |
|-------|------------|-----------|
| **Cliente** | QR da mesa | Nome → cardápio → pedir → total |
| **Cozinha** | Login staff | Status + **imprimir comanda** |
| **Garçom** | Link `/garcom/:token` | Entrega com lock |
| **Caixa** | Login staff | Fecha + desconto/taxa + PIX |
| **Admin** | Login | Dashboard, cardápio, QR, pedidos |

---

## 🛠️ Stack

Node.js 22+ · PostgreSQL (Neon) · HTML/CSS/JS vanilla · SSE · QR UUID

**Dependências:** `pg` · `dotenv`

---

## 🚀 Instalação

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm start
# http://localhost:3000 → /admin
```

Staff seed: `admin`, `cozinha`, `caixa`.

---

## 🔌 API (resumo)

**Público:** `/api/events` · `/api/cardapio` · `/api/mesas/:token/*` · `/api/garcom/:token/*`

**Staff:** cozinha · `PATCH /api/pedidos/:id/status` · caixa · `/api/admin/*`

**Caixa fechar** `POST /api/caixa/sessoes/:id/fechar`

```json
{ "formaPagamento": "pix", "desconto": 5, "taxaServico": 2.5 }
```

Resposta inclui `valorTotal`, `desconto`, `taxaServico`, `valorCobrado`.

---

## 🔐 Segurança

UUID na mesa · preços no servidor · auth cookie HttpOnly · rate limit · CSP

---

## 📁 Estrutura

```text
├── db/                 # migrations (…0007_desconto_taxa), pedidos, caixa…
├── public/             # admin, mesa, cozinha, caixa, style.css, style-ops.css
├── data/db.json        # seed apenas
├── server.js
└── README.md
```

---

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| **v2.0–v2.5** | MVP → auth → dashboard → PDF → estoque → UI | ✅ |
| **v2.6** | Polimento — print ✅ · desconto ✅ · fotos ⬜ · limpeza ⬜ | 🟡 |
| **v2.7+** | Pagamento avançado (divisão, PIX mesa) | ⬜ |
| **v3** | Gateway, delivery, multi-loja | ⬜ |

### Changelog recente

| Data | Mudança |
|------|---------|
| 2026-08-29 | **v2.6** — print de comanda na cozinha; desconto/taxa no caixa (migração 0007) |
| 2026-08-29 | Roadmap pagamento/divisão documentado; foco polimento |
| 2026-08-29 | **v2.5** Design System v2 |
| 2026-08-29 | **v2.4** Estoque · **v2.3** PDF/purge |
| 2026-08-28 | **v2.2** Dashboard · **v2.1** Auth |

---

## 📄 Licença

Uso interno / educacional.

---

<div align="center">

**Lanchonete QR** — do QR na mesa até o caixa.

`Cliente → Cozinha → Garçom → Caixa`

</div>
