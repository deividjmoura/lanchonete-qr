<div align="center">

# 🍔 Lanchonete QR

**Pedidos por QR Code** — do celular do cliente até a cozinha, o garçom e o caixa.

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Neon](https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=black)](https://neon.tech/)
[![License](https://img.shields.io/badge/status-v2.9%20completo-green?style=for-the-badge)](./ROADMAP.md)

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
| 👨‍🍳 Cozinha · 🏃 Garçom · 🔊 voz | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 💵 Caixa · Auth · SSE · divisão | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 📦 Estoque · Dashboard · PDF/purge | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 💠 PIX (QR + aviso multi) | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 📷 Fotos WebP (upload + link) | ![done](https://img.shields.io/badge/100%25-22c55e?style=flat-square) |
| 🚀 Gateway · Delivery | ![todo](https://img.shields.io/badge/planejado-f59e0b?style=flat-square) |

**Visão geral**

`████████████████████` **v2 completo** · próximo: gateway / delivery (v3)

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
  <b>Node.js</b> (HTTP nativo) · <b>PostgreSQL</b> (Neon) · <b>SSE</b> · <b>PIX</b> EMV · <b>sharp</b> (WebP) · <b>Web Speech</b> (voz)
</p>

---

## 🖥️ Telas

| Papel | Rota | O que faz |
|:-----:|:-----|:----------|
| 👤 Cliente | `/mesa/:token` | Cardápio, **Escolher**, personalizar, carrinho, conta + PIX |
| 👨‍🍳 Cozinha | `/cozinha` | Fila + **alerta de voz** (mesa + cliente) |
| 🏃 Garçom | `/garcom/:token` | Entrega + **voz engraçada** (nº da mesa) |
| 💵 Caixa | `/caixa` | Fecha conta, **divisão**, desconto/taxa, PIX, alerta |
| ⚙️ Admin | `/admin` | Cardápio (CRUD + **upload foto**), mesas, dashboard, relatório |
| 🔐 Login | `/login` | Auth por papel (admin / cozinha / caixa) |

---

## 📷 Fotos no cardápio (admin)

1. Aba **Cardápio** → **Novo produto** ou **Editar** um item  
2. **Escolher arquivo** (upload) **ou** colar um link https  
3. A imagem é otimizada no servidor (**~480px**, **WebP**) e salva em `/uploads`  
4. No banco fica só o caminho (`/uploads/….webp`) — leve no celular e no storage  

```http
POST /api/admin/upload-foto
Body: { "data": "data:image/jpeg;base64,…" }  // ou { "url": "https://…" }
```

> Requer `npm install` (dependência **sharp**). Pasta `public/uploads/` precisa ser gravável.

---

## 🥤 Cardápio: Adicionar · Personalizar · Escolher

| Tipo de produto | Botão | Como cadastrar |
|-----------------|--------|----------------|
| Simples | **Adicionar** | Sem opções extras |
| Lanche com extras | **Adicionar** + **Personalizar** | Adicionais (multi) + removíveis |
| Bebida / tamanho / sabor | **Escolher** | Categoria *Bebidas* (ou só adicionais) → **uma** opção (rádio) |

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
| **Mesa → Total** | Bloco de pagamento sempre visível; QR quando há total |
| **Mesa** | Copiar código + **Já paguei no PIX** avisa o caixa |
| **Caixa** | Toast + beep + voz · fecha a sessão |

A conta **não** fecha sozinha — o caixa confirma.

```http
GET  /api/config/pix
POST /api/mesas/:token/pix-informado
```

---

## ✂️ Divisão de conta (caixa)

1. Informe **N pessoas** → **Usar valor/pessoa**  
2. Escolha a forma → **Registrar pagamento**  
3. Repita; o badge mostra **pago / restante**  
4. Ao **Fechar conta**, o que faltar é quitado  

```http
POST /api/caixa/sessoes/:id/pagamentos
Body: { "valor": 25.50, "formaPagamento": "pix" }
```

---

## 🔊 Alertas de voz

| Tela | Quando | Conteúdo |
|------|--------|----------|
| Cozinha | Pedido novo | Mesa + nome do cliente |
| Garçom | Pedido pronto | Só nº da mesa (tom leve) |
| Caixa | PIX informado | Mesa + forma |

Usa a **Web Speech API** do navegador (`public/js/voz-ops.js`). No primeiro toque na página a voz “desbloqueia”.

---

## 📁 Estrutura

```text
lanchonete-qr/
├── server.js
├── db/           # Postgres, admin, foto (sharp), pedidos…
├── public/       # HTML/CSS/JS + uploads/
├── ROADMAP.md
└── .env.example
```

---

## 🗺️ Roadmap

Detalhes em **[ROADMAP.md](./ROADMAP.md)**.

| Agora | Depois |
|:-----:|:------:|
| ✅ **v2.9** — voz, fotos WebP, exclusão, UX cards | ⬜ Gateway PIX |
| ✅ PIX · divisão · estoque · dashboard | ⬜ Delivery · multi-loja |

---

<div align="center">

**Feito com ☕ e QR Code** · [deividjmoura](https://github.com/deividjmoura)

[![Portfolio](https://img.shields.io/badge/Portfolio-deividmoura.netlify.app-0A66C2?style=for-the-badge)](https://deividmoura.netlify.app/)

</div>
