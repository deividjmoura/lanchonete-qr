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
| **Estoque / polimento** | 🟡 próximo |

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

| Prioridade | Item |
|:----------:|------|
| Média | Estoque mínimo + esgotar produto |
| Baixa | Impressão de comanda, desconto, fotos |
| Depois | Gateway, delivery, multi-tenant |

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

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0 | MVP Core | ✅ |
| v2.1 | Auth + sessão | ✅ |
| v2.2 | Dashboard do dia | ✅ |
| v2.3 | Estoque | ⬜ |
| v2.4 | Polimento | ⬜ |
| v3 | Pagamentos / multi-loja | ⬜ |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
