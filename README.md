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
| **PIX na mesa + caixa** | ✅ |
| **Divisão de conta** | ⬜ depois |

### ✅ Pronto

| Módulo | Detalhe |
|--------|---------|
| Mesa | Cardápio, personalizar, fotos, **PIX na conta** |
| Cozinha / Garçom | Fila + imprimir comanda |
| Caixa | Desconto/taxa + PIX (config via `.env`) |
| Admin | Dashboard, estoque, PDF, purge |

---

## 💳 PIX

No `.env`:

```env
PIX_CHAVE=sua-chave
PIX_NOME=Nome no extrato
PIX_CIDADE=SuaCidade
```

- **Mesa** → Conta → QR + copiar código (total da sessão)
- **Caixa** → forma PIX no fechamento (usa o valor a cobrar)
- Cliente paga e **mostra comprovante no caixa** (sem gateway automático)

API: `GET /api/config/pix`

---

## 🚀 Instalação

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm start
```

---

## 🗺️ Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0–v2.6 | MVP → polimento → PIX | ✅ |
| **v2.7+** | Divisão de conta | ⬜ |
| **v3** | Gateway, delivery, multi-loja | ⬜ |

### Changelog

| Data | Mudança |
|------|---------|
| 2026-08-30 | **PIX** configurável; QR na mesa + caixa; mesa modular (`mesa-*.css`, `mesa-app-*.js`) |
| 2026-08-30 | Print garçom; faturamento com `valor_cobrado` |
| 2026-08-29 | Print cozinha · desconto/taxa · estoque · PDF |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
