<div align="center">

# 🍔 Lanchonete QR

**Pedidos por QR Code** — do celular do cliente até a cozinha, o garçom e o caixa.

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Neon](https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=black)](https://neon.tech/)
[![License](https://img.shields.io/badge/status-v2.6%20PIX-orange?style=for-the-badge)](./ROADMAP.md)

</div>

---

## 🎬 O fluxo

```text
  📱 Cliente          👨‍🍳 Cozinha         🏃 Garçom          💵 Caixa
 ┌──────────┐       ┌──────────┐       ┌──────────┐       ┌──────────┐
 │ QR mesa  │ ───▶  │ prepara  │ ───▶  │ entrega  │ ───▶  │ fecha    │
 │ cardápio │       │ pedido   │       │ na mesa  │       │ + PIX    │
 └──────────┘       └──────────┘       └──────────┘       └──────────┘
       │                                                      ▲
       └──────── conta acumulativa da sessão ─────────────────┘
```

Uma mesa pode fazer **vários pedidos** na mesma visita. O que vale no caixa é a **sessão** (comanda), não o pedido isolado.

---

## 📊 Progresso do projeto

<div align="center">

| Módulo | Status |
|:------:|:------:|
| 🗄️ Postgres + Neon | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 📱 Mesa (QR + cardápio + Escolher) | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 👨‍🍳 Cozinha · 🏃 Garçom | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 💵 Caixa · Auth · SSE | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 📦 Estoque · Dashboard | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 💠 PIX (QR + aviso) | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| ✂️ Divisão de conta | ![todo](https://img.shields.io/badge/0%25-64748b?style=flat-square) |
| 🚀 Gateway · Delivery | ![todo](https://img.shields.io/badge/planejado-f59e0b?style=flat-square) |

**Visão geral**

`████████████████░░░░` **~80%** do roadmap v2 · próximo: divisão de conta

📌 Detalhes → **[ROADMAP.md](./ROADMAP.md)**

</div>

---

## 🚀 Tecnologias

<div align="center">
  <img height="56" alt="Node.js" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg"/>
  &nbsp;
  <img height="56" alt="JavaScript" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg"/>
  &nbsp;
  <img height="56" alt="HTML5" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/html5/html5-original.svg"/>
  &nbsp;
  <img height="56" alt="CSS3" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg"/>
  &nbsp;
  <img height="56" alt="PostgreSQL" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg"/>
  &nbsp;
  <img height="56" alt="Git" src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/git/git-original.svg"/>
</div>

<p align="center">
  <b>Node.js</b> (HTTP nativo) · <b>PostgreSQL</b> (Neon) · <b>SSE</b> em tempo real · <b>PIX</b> estático (EMV)
</p>

---

## 🖥️ Telas

| Papel | Rota | O que faz |
|:-----:|:-----|:----------|
| 👤 Cliente | `/mesa/:token` | Cardápio, **Escolher** (bebidas), personalizar, carrinho, conta + PIX |
| 👨‍🍳 Cozinha | `/cozinha` | Fila `recebido` → `em_producao` → `concluido` |
| 🏃 Garçom | `/garcom/:token` | Entrega `concluido` → `entregue` |
| 💵 Caixa | `/caixa` | Fecha conta, desconto/taxa, PIX, alerta em tempo real |
| ⚙️ Admin | `/admin` | Cardápio, mesas/QR, dashboard, relatório, purge |
| 🔐 Login | `/login` | Auth por papel (admin / cozinha / caixa) |

---

## 🥤 Cardápio: Adicionar · Personalizar · Escolher

| Tipo de produto | Botão | Como cadastrar |
|-----------------|--------|----------------|
| Simples | **Adicionar** | Sem opções extras |
| Lanche com extras | **Adicionar** + **Personalizar** | Adicionais (multi) + removíveis |
| Bebida / tamanho / sabor | **Escolher** | Categoria *Bebidas* (ou só adicionais, sem remoção) → **uma** opção (rádio) |

Ex.: produto `Coca-Cola` + adicionais `Lata`, `600ml`, `2L` → o cliente toca **Escolher** e marca um tamanho.

---

## ⚡ Subir local

```bash
npm install
cp .env.example .env   # edite DATABASE_URL e PIX_*
npm run db:migrate
npm run db:seed
npm start
```

Abre em `http://localhost:3000`.

### Variáveis importantes

```env
DATABASE_URL=postgres://...
DATABASE_SSL=true
STAFF_SEED_PASSWORD=troque-esta-senha

PIX_CHAVE=12345678901
PIX_NOME=LANCHONETE QR
PIX_CIDADE=PENHA SC
```

> 💡 CPF com pontos/traço também funciona. Nome e cidade são limpos pro EMV.

---

## 💠 PIX na mesa e no caixa

| Onde | Ação |
|------|------|
| **Mesa → Total** | Bloco de pagamento sempre visível; QR quando há total (pedidos entregues) |
| **Mesa** | Copiar código + **Já paguei no PIX** avisa o caixa |
| **Caixa** | Toast + beep + badge · fecha a sessão |

A conta **não** fecha sozinha — o caixa confirma.

```http
GET  /api/config/pix
POST /api/mesas/:token/pix-informado
```

---

## 📁 Estrutura

```text
lanchonete-qr/
├── server.js
├── db/
├── public/
├── ROADMAP.md
└── .env.example
```

---

## 🗺️ Roadmap

Detalhes em **[ROADMAP.md](./ROADMAP.md)**.

| Agora | Depois |
|:-----:|:------:|
| ✅ PIX + Escolher (bebidas) | ⬜ Divisão de conta |
| ✅ Estoque · dashboard · PDF/purge | ⬜ Gateway · delivery |

---

<div align="center">

**Feito com ☕ e QR Code** · [deividjmoura](https://github.com/deividjmoura)

[![Portfolio](https://img.shields.io/badge/Portfolio-deividmoura.netlify.app-0A66C2?style=for-the-badge)](https://deividmoura.netlify.app/)

</div>
