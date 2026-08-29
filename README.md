# 🍔 Lanchonete QR

> Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

```text
Cliente (QR) ──▶ Pedido ──▶ Cozinha ──▶ Garçom ──▶ Conta da mesa ──▶ Caixa
```

---

## 📊 Progresso

| Fase | Status |
|------|:------:|
| **MVP Core** (fluxo completo) | ✅ |
| **Auth + papéis + sessão DB** | ✅ |
| **Dashboard do dia** | ✅ |
| **Relatório PDF / purge / estoque** | 🟡 próximo |

### ✅ Pronto

| Módulo | Detalhe |
|--------|---------|
| Schema + migrations PostgreSQL | Neon / local |
| Cardápio, pedidos, comanda acumulativa | Preços no servidor |
| Cozinha · Garçom · Caixa | Filas + SSE |
| Admin | Cardápio, QR, garçons, **pedidos kanban**, **dashboard** |
| Auth com papéis | `admin` / `cozinha` / `caixa` + sessão Postgres |
| Mesa · personalizar | Adicionais, remoções, qtd, animação do sanduíche |
| Tema warm (laranja) | Tokens light/dark orientados a food service |
| Dashboard do dia | Faturamento, ticket, top produtos, operação |

### 🟡 Próxima fase

| Prioridade | Item | Notas |
|:----------:|------|-------|
| 🟠 Média | **Relatório de vendas em PDF** (download) | Faturamento, pedidos, top produtos por período |
| 🟠 Média | **Limpeza / purge de dados históricos** | Apagar pedidos/sessões antigos para liberar espaço no banco |
| 🟠 Média | Estoque mínimo + esgotar produto | Evita vender o que acabou |
| 🟡 Baixa | Impressão de comanda, desconto, fotos | Polimento operacional |
| ⚪ Depois | Gateway, delivery, multi-tenant | Escala |

---

## 🚀 Instalação

```bash
npm install && cp .env.example .env
# DATABASE_URL=...  ADMIN_PASSWORD=...
npm run db:migrate && npm run db:seed
npm start   # http://localhost:3000
```

Staff seed: `admin` / `cozinha` / `caixa` (senha `STAFF_SEED_PASSWORD` ou `ADMIN_PASSWORD`).

---

## 📱 Cliente (`/mesa/:token`)

- Lousa com seções · check-in com nome
- **Adicionar** ou **Personalizar** (extras, remoções, qtd, observação)
- Dock: sanduíche (animação) + sacola da conta

---

## 📊 Admin · Dashboard

Aba **Dashboard** (primeira do `/admin`):

| KPI | Origem |
|-----|--------|
| **Faturamento** | Sessões fechadas hoje |
| **Ticket médio** | Faturamento ÷ contas |
| **Pedidos hoje** | Por status |
| **Mesas ocupadas** | Status atual + valor em aberto |
| **Top produtos** | Itens criados hoje |

Atualiza ao abrir a aba e via SSE.

---

## 🧾 Admin · Pedidos

| Área | Comportamento |
|------|----------------|
| **Ativos** | Kanban: Recebido → Na cozinha → Pronto |
| **Histórico** | Só sob busca por data |

---

## 🔌 API (staff)

- `GET /api/admin/dashboard` — resumo do dia
- `GET /api/admin/pedidos?ativos=1` — fila ativa
- `GET /api/admin/pedidos?from=&to=` — histórico

---

## 📈 Capacidade (estimativa realista)

Stack atual: **Node HTTP nativo + PostgreSQL (Neon) + SSE**. Sem fila Redis, sem workers.

### Usuários simultâneos (com pouco delay)

| Cenário | Quem | Estimativa confortável |
|---------|------|------------------------|
| **1 lanchonete típica** | ~8–20 mesas com clientes no celular + 1 cozinha + 1–2 garçons + 1 caixa | **25–40 conexões ativas** (SSE + HTTP) |
| **Pico do almoço** | Vários pedidos em sequência | OK se o host do app não dormir (cold start) |
| **Limite prático no free** | App em free tier (ex.: Render 512 MB) + Neon free | **~30–50 clientes simultâneos** antes de sentir lentidão; acima disso o gargalo é RAM/CPU do app ou cold start, não o código em si |

O modelo de **uma sessão por mesa** e cardápio com cache ajuda. O que mais pesa é **SSE aberto** (cozinha/admin/mesa) e **cold start** se o host free hibernar.

> **Recomendação produção leve:** app sempre ligado (plano pago mínimo do host) + Neon free ainda serve no começo. Evita o delay de 15–60 s do sleep.

### Quando o banco (Neon Free · 0,5 GB) enche?

Neon Free (por projeto): **0,5 GB de storage**, **100 CU-hours/mês**, scale-to-zero após ~5 min idle.

Ordem de grandeza (pedidos + itens + sessões + índices):

| Ritmo da loja | Pedidos/dia (ordem) | Espaço aproximado | Tempo até ~0,5 GB |
|---------------|---------------------|-------------------|-------------------|
| Calmo | ~50 | dezenas de MB/ano | **vários anos** |
| Típico | ~100–200 | ~50–150 MB/ano | **~2–5 anos** sem purge |
| Bem movimentado | ~400–600 | cresce mais rápido | **~1–2 anos** |

O que mais ocupa espaço: **itens de pedido**, **sessões fechadas** e índices — não o cardápio.

**CU-hours:** com scale-to-zero, uso diário em horário comercial costuma caber no free; o risco é acordar o banco o tempo todo ou relatórios pesados sem filtro.

**No roadmap:** relatório PDF + **purge** de histórico antigo para liberar espaço sem depender só de upgrade.

---

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0 | MVP Core | ✅ |
| v2.1 | Auth + sessão | ✅ |
| v2.2 | Dashboard do dia | ✅ |
| v2.3 | Relatório PDF + purge de histórico | ⬜ |
| v2.4 | Estoque mínimo | ⬜ |
| v2.5 | Polimento (print, desconto, fotos) | ⬜ |
| v3 | Pagamentos / multi-loja | ⬜ |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
