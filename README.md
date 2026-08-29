# 🍔 Lanchonete QR

> Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular do cliente até a cozinha, o garçom e o caixa.

```text
Cliente (QR) ──▶ Pedido ──▶ Cozinha ──▶ Garçom ──▶ Conta da mesa ──▶ Caixa
```

---

## 📊 Progresso

| Fase | Status |
|------|:------:|
| **MVP Core** | ✅ |
| **Auth + papéis** | ✅ |
| **Dashboard do dia** | ✅ |
| **Relatório PDF + purge** | ✅ |
| **Estoque mínimo** | ✅ |
| **Polimento** | 🟡 próximo |

### ✅ Pronto (destaques)

- Cardápio, pedidos, cozinha, garçom, caixa + SSE
- Admin: kanban, dashboard, relatório PDF, purge
- Mesa: personalizar (adicionais, remoções, animação)
- **Estoque opcional** por produto (controlar, mínimo, esgotar)

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
npm run db:migrate   # 0006_estoque.sql
```

---

## 🚀 Instalação

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm start
```

---

## 📊 Admin · Dashboard

- KPIs do dia (SSE)
- Relatório PDF · Limpar histórico (sessões fechadas)

---

## 🔌 API (staff)

- `GET /api/admin/dashboard` · `GET /api/admin/relatorio?from=&to=`
- `POST /api/admin/historico/purge` `{ before, confirm }`
- `GET /api/admin/pedidos?ativos=1` · `?from=&to=`
- Produtos: `controlaEstoque`, `estoque`, `estoqueMinimo` no PATCH/POST

---

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0–v2.3 | MVP → PDF/purge | ✅ |
| **v2.4** | Estoque mínimo | ✅ |
| v2.5 | Polimento (print, desconto, fotos) | ⬜ |
| v3 | Pagamentos / multi-loja | ⬜ |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
