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
| **Auth + dashboard + PDF/purge + estoque** | ✅ |
| **Polimento** (print, desconto, fotos) | ✅ |
| **Pagamento avançado** | ⬜ v2.7+ |

### ✅ Pronto

| Módulo | Detalhe |
|--------|---------|
| Fluxo operacional | Cozinha · Garçom · Caixa · SSE |
| Cozinha | Fila + **imprimir comanda** (72mm) |
| Garçom | Entrega + **imprimir comanda** |
| Caixa | Desconto / taxa de serviço → `valor_cobrado` + PIX |
| Admin | Dashboard (faturamento usa valor cobrado), cardápio, estoque, PDF, purge |
| Mesa | Cardápio + **fotos** (`fotoUrl`) + personalizar |

---

## 🖨 Comanda impressa

- **Cozinha** e **Garçom**: botão **Imprimir** em cada pedido
- Layout ticket ~72mm (mesa, cliente, itens, extras, obs.)
- Use impressora térmica ou “Salvar como PDF” no navegador

---

## 💵 Caixa — desconto e taxa

```bash
npm run db:migrate   # 0007_desconto_taxa.sql
```

No fechamento: **Desconto (R$)** e **Taxa de serviço (R$)**; “A cobrar” atualiza ao vivo; PIX usa o valor cobrado.

```json
POST /api/caixa/sessoes/:id/fechar
{ "formaPagamento": "pix", "desconto": 5, "taxaServico": 2.5 }
```

---

## 🖼 Fotos dos produtos

No **Admin → Cardápio**: campo **URL da foto** (https://… ou caminho relativo).
Aparece no cardápio da mesa (`/mesa/:token`).

---

## 🚀 Instalação

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm start
```

Staff: `admin` / `cozinha` / `caixa`.

---

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0–v2.5 | MVP → estoque → design | ✅ |
| **v2.6** | Print · desconto · fotos · faturamento líquido | ✅ |
| **v2.7+** | Divisão de conta, PIX na mesa | ⬜ |
| **v3** | Gateway, delivery, multi-loja | ⬜ |

### Changelog

| Data | Mudança |
|------|---------|
| 2026-08-30 | Print no **garçom**; dashboard/relatório com `valor_cobrado` |
| 2026-08-29 | Print cozinha · desconto/taxa caixa · fotos no cardápio |
| 2026-08-29 | Estoque · PDF/purge · dashboard · auth |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
