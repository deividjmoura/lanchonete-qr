const token=location.pathname.split('/').filter(Boolean).pop()||'';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!UUID_RE.test(token)){document.body.innerHTML='<main class="wrap"><div class="panel"><h2>Mesa inválida</h2><p class="muted">Escaneie o QR Code da mesa.</p></div></main>';throw new Error('token inválido');}
let categorias=[],produtos=[],cart=[],totalDevido=0,cartOpen=false,sessaoData=null,sessaoOpen=false,clienteNome='';
function getClienteNome(){if(clienteNome)return clienteNome;try{clienteNome=sessionStorage.getItem('lq-cliente-nome-'+token)||'';}catch(_){}return clienteNome;}
function setClienteNome(nome){clienteNome=String(nome||'').trim().slice(0,80);try{sessionStorage.setItem('lq-cliente-nome-'+token,clienteNome);}catch(_){}}
function ensureClienteNome(){return new Promise((resolve)=>{if(getClienteNome())return resolve(getClienteNome());const gate=document.getElementById('nameGate');const input=document.getElementById('clienteNomeInput');const btn=document.getElementById('clienteNomeBtn');gate.hidden=false;setTimeout(()=>input.focus(),50);const done=()=>{const n=(input.value||'').trim();if(!n){input.focus();return;}setClienteNome(n);gate.hidden=true;fetch('/api/mesas/'+token+'/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clienteNome:n})}).catch(()=>{});resolve(n);};btn.addEventListener('click',done);input.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();done();}});});}
const STATUS_LABEL={recebido:'Recebido',em_producao:'Na cozinha',concluido:'Pronto',entregue:'Entregue'};
const br=n=>'R$ '+Number(n).toFixed(2).replace('.',',');
const esc=(s)=>{if(window.SafeDOM&&typeof SafeDOM.escapeHtml==='function')return SafeDOM.escapeHtml(s);return String(s??'').replace(/[&<>"']/g,m=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#039;'}[m]));};
function cartCount(){return cart.reduce((s,i)=>s+i.qty,0);}
function cartTotal(){return cart.reduce((s,i)=>s+itemTotal(i),0);}
function updateCartPill(){const n=cartCount();const badge=document.getElementById('cartBadge');if(badge){badge.textContent=n;badge.classList.toggle('show',n>0);}const total=totalDevido||(sessaoData&&sessaoData.totalDevido)||0;const contaBadge=document.getElementById('contaBadge');if(contaBadge){contaBadge.textContent=total>0?'•':'$';contaBadge.classList.toggle('show',total>0||(sessaoData&&(sessaoData.pedidos||[]).length>0));}}
function showToast(message,ms=1800){const toast=document.getElementById('toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>toast.classList.remove('show'),ms);}
function bounceBurger(){const btn=document.getElementById('burgerBtn');if(!btn)return;btn.classList.remove('pop');void btn.offsetWidth;btn.classList.add('pop');clearTimeout(bounceBurger._t);bounceBurger._t=setTimeout(()=>btn.classList.remove('pop'),600);}
function productNeedsCustom(p){return !!(p.pedePontoCarne||(p.adicionais&&p.adicionais.length)||(p.removiveis&&p.removiveis.length));}
/** Bebidas / só opções (tamanhos): escolha única, não "personalizar lanche". */
function productIsEscolha(p,catNome){
  if(!p||!(p.adicionais&&p.adicionais.length))return false;
  const cat=String(catNome||p._catNome||'').toLowerCase();
  // Bebidas / drinks / sucos / cervejas / energéticos: sempre escolha única (rádio)
  if(/bebida|drink|refri|suco|agua|cerveja|energ/.test(cat))return true;
  // Produto só com opções (sem ponto de carne e sem removíveis) = Escolher
  return !p.pedePontoCarne&&!(p.removiveis&&p.removiveis.length);
}
function itemKey(productId,additions,removals,note){return productId+'|'+[...additions].map(a=>a.id).sort().join(',')+'|'+(removals||[]).slice().sort().join(',')+'|'+(note||'');}
function itemTotal(i){const p=produtos.find(x=>x.id===i.productId);if(!p)return 0;const add=i.additions.reduce((s,a)=>s+Number(a.preco||0),0);return (Number(p.preco)+add)*i.qty;}
async function loadSessao(){try{const r=await fetch('/api/mesas/'+token+'/sessao');if(!r.ok)return;const s=await r.json();sessaoData=s;window.sessaoData=s;totalDevido=s.totalDevido||0;document.getElementById('mesaDesk').textContent='Mesa '+s.mesa+(getClienteNome()?' · '+getClienteNome():' · Cardápio');updateCartPill();if(sessaoOpen)openSessao();}catch(_){}}
function openSessao(){sessaoOpen=true;cartOpen=false;const s=sessaoData||{pedidos:[],totalDevido:0,mesa:'—'};const pedidos=s.pedidos||[];const blocks=pedidos.length?pedidos.slice().reverse().map(p=>{const itens=(p.itens||[]).map(it=>`<div class="pedido-item"><div><b>${it.quantidade}× ${esc(it.nome)}</b></div><b>${br(it.totalLinha||0)}</b></div>`).join('');return `<div class="pedido-block"><div class="row" style="justify-content:space-between"><b>Pedido #${p.id}</b><span class="status-pill ${esc(p.status)}">${STATUS_LABEL[p.status]||p.status}</span></div>${itens}<div class="pedido-item"><span class="muted">Subtotal</span><b>${br(p.totalPedido||0)}</b></div></div>`;}).join(''):'<div style="text-align:center;padding:28px;color:#a89f8c">Nenhum pedido ainda.</div>';const pago=Number(s.valorPago||0);const rest=s.valorRestante!=null?Number(s.valorRestante):Math.max(0,Number(s.totalDevido||0)-pago);const totalLine=pago>0.009?`<div class="cart-total-row"><span>Total da conta</span><span>${br(s.totalDevido||0)}</span></div><div class="cart-total-row" style="font-size:.95rem;opacity:.9"><span>Já pago</span><span>${br(pago)}</span></div><div class="cart-total-row"><span>A pagar</span><span>${br(rest)}</span></div>`:`<div class="cart-total-row"><span>Total</span><span>${br(s.totalDevido||0)}</span></div>`;document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>Conta da mesa ${esc(String(s.mesa??''))}</h2>${totalLine}${blocks}</div></div>`;document.body.classList.add('modal-open');}
function togglePedir(){if(cartOpen){closeModal();return;}openCart();}
function toggleConta(){if(sessaoOpen){closeModal();return;}openSessao();}
async function loadCardapio(){const r=await fetch('/api/cardapio');if(!r.ok){document.getElementById('menu').innerHTML='<div style="padding:20px;color:#a89f8c">Não foi possível carregar o cardápio.</div>';return;}categorias=await r.json();produtos=categorias.flatMap(c=>c.produtos||[]);renderMenu();}
function toggleCat(btn){
  const cat=btn&&btn.closest('.chalk-cat');
  if(!cat)return;
  const wasOpen=cat.classList.contains('open');
  document.querySelectorAll('.chalk-cat.open').forEach(function(el){el.classList.remove('open');});
  if(!wasOpen)cat.classList.add('open');
}
function renderMenu(){
  const nProd=function(c){return (c.produtos&&c.produtos.length)||0;};
  document.getElementById('menu').innerHTML=categorias.map(c=>`<div class="chalk-cat"><button type="button" class="chalk-cat__head" onclick="toggleCat(this)" aria-expanded="false"><span>${esc(c.nome)} <span class="cat-count">${nProd(c)}</span></span><span class="chev">▼</span></button><div class="chalk-cat__body">${(c.produtos||[]).map(p=>{p._catNome=c.nome;const escolha=productIsEscolha(p,c.nome);const custom=productNeedsCustom(p);let btns;if(escolha){btns=`<button class="btn primary" type="button" onclick="openCustomize(${p.id})">Escolher</button>`;}else if(custom){btns=`<div class="actions"><button class="btn primary" type="button" onclick="quickAdd(${p.id})">Adicionar</button><button class="btn ghost" type="button" onclick="openCustomize(${p.id})">Personalizar</button></div>`;}else{btns=`<button class="btn primary" type="button" onclick="quickAdd(${p.id})">Adicionar</button>`;}const foto=p.fotoUrl?`<img class="chalk-item__photo" src="${esc(p.fotoUrl)}" alt="" loading="lazy" onerror="this.remove()">`:'';return `<article class="chalk-item${p.fotoUrl?' has-photo':''}">${foto}<div class="chalk-body"><h3>${esc(p.nome)}</h3><p class="desc">${esc(p.descricao||'')}</p><div class="row"><span class="price">${br(p.preco)}</span>${btns}</div></div></article>`;}).join('')}</div></div>`).join('');
}
function quickAdd(id){const p=produtos.find(x=>x.id===id);if(!p)return;const key=itemKey(id,[],[],'');const existing=cart.find(x=>x.key===key);if(existing)existing.qty+=1;else cart.push({key,productId:id,qty:1,additions:[],removals:[],note:''});updateCartPill();bounceBurger();showToast(p.nome+' adicionado');}
let customizeDraft=null;
function openCustomize(id){const p=produtos.find(x=>x.id===id);if(!p)return;const escolha=productIsEscolha(p);customizeDraft={productId:id,qty:1,additions:[],removals:[],note:'',ponto:null,escolha};if(escolha&&p.adicionais&&p.adicionais.length===1){const a0=p.adicionais[0];customizeDraft.additions=[{id:a0.id,nome:a0.nome,preco:Number(a0.preco)}];}renderCustomizeModal();}
function closeModal(){document.getElementById('modal').innerHTML='';document.body.classList.remove('modal-open');cartOpen=false;sessaoOpen=false;customizeDraft=null;}
