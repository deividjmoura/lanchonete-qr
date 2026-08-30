# 🍔 Lanchonete QR

> Sistema de pedidos por **QR Code** para lanchonetes — do cardápio no celular até a cozinha, o garçom e o caixa.

```text
Cliente (QR) ──▶ Pedido ──▶ Cozinha ──▶ Garçom ──▶ Conta da mesa ──▶ Caixa
```

---

## Progresso

| Fase | Status |
|------|:------:|
| MVP Core | ✅ |
| Auth · dashboard · PDF/purge · estoque · polimento | ✅ |
| **PIX** (mesa + caixa + aviso ao caixa) | ✅ |
| Divisão de conta | ⬜ depois |

---

## PIX

No `.env`:

```env
PIX_CHAVE=sua-chave
PIX_NOME=Nome no extrato
PIX_CIDADE=SuaCidade
```

```bash
npm run db:migrate   # inclui 0008_pix_informado.sql
```

| Onde | O que faz |
|------|-----------|
| **Mesa → Conta** | QR + copiar código · botão **Já paguei no PIX** avisa o caixa |
| **Caixa** | Badge *PIX informado pelo cliente* · fecha a conta (desconto/taxa) |

A sessão **não** fecha sozinha — o caixa confirma o pagamento.

API: `GET /api/config/pix` · `POST /api/mesas/:token/pix-informado`

---

## Instalação

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm start
```

---

## Roadmap

| Versão | Foco | Status |
|--------|------|:------:|
| v2.0–v2.6 | MVP → PIX | ✅ |
| **v2.7+** | Divisão de conta | ⬜ |
| **v3** | Gateway, delivery, multi-loja | ⬜ |

---

**Lanchonete QR** — `Cliente → Cozinha → Garçom → Caixa`
