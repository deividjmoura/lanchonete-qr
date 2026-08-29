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
| **Relatório PDF + purge** | ✅ |
| **Estoque / polimento** | 🟡 próximo |

### ✅ Pronto

| Módulo | Detalhe |
|--------|---------|
| Schema + migrations PostgreSQL | Neon / local |
| Cardápio, pedidos, comanda acumulativa | Preços no servidor |
| Cozinha · Garçom · Caixa | Filas + SSE |
| Admin | Cardápio, QR, garçons, pedidos kanban, dashboard |
| Auth com papéis | `admin` / `cozinha` / `caixa` |
| Mesa · personalizar | Adicionais, remoções, animação |
| Dashboard do dia | Faturamento, ticket, top produtos |
| **Relatório PDF** | Por período → imprimir / salvar PDF |
| **Purge de histórico** | Apaga sessões fechadas antigas (libera espaço) |

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
npm run db:migrate && npm run db:seed
npm start
```

---

## 📊 Admin · Dashboard

- KPIs do dia (SSE)
- **Relatório de vendas (PDF):** De / Até → Gerar / imprimir PDF
- **Limpar histórico:** data limite → prévia → apagar (só sessões **fechadas**)

---

## 🔌 API (staff)

- `GET /api/admin/dashboard`
- `GET /api/admin/relatorio?from=&to=`
- `POST /api/admin/historico/purge` body: `{ "before": "YYYY-MM-DD", "confirm": true }`
- `GET /api/admin/pedidos?ativos=1` · `?from=&to=`

---

## 📈 Capacidade

Ver seção detalhada no histórico do README: ~25–40 conexões confortáveis; Neon Free 0,5 GB ~anos de operação típica com purge periódico.

---

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0–v2.2 | MVP + auth + dashboard | ✅ |
| **v2.3** | Relatório PDF + purge | ✅ |
| v2.4 | Estoque mínimo | ⬜ |
| v2.5 | Polimento | ⬜ |
| v3 | Pagamentos / multi-loja | ⬜ |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
