const token=location.pathname.split('/').filter(Boolean).pop()||'';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!UUID_RE.test(token)){document.body.innerHTML='<main class="wrap"><div class="panel"><h2>Mesa inválida</h2><p class="muted">Escaneie o QR Code da mesa.</p></div></main>';throw new Error('token inválido');}
let categorias=[],produtos=[],cart=[],totalDevido=0,cartOpen=false,sessaoData=null,sessaoOpen=false,clienteNome='';
/** Último status visto por pedido — para toast de mudança */
let lastStatusMap={};
function getClienteNome(){if(clienteNome)return clienteNome;try{clienteNome=sessionStorage.getItem('lq-cliente-nome-'+token)||'';}catch(_){}return clienteNome;}
function setClienteNome(nome){clienteNome=String(nome||'').trim().slice(0,80);try{sessionStorage.setItem('lq-cliente-nome-'+token,clienteNome);}catch(_){}}
function ensureClienteNome(){return new Promise((resolve)=>{if(getClienteNome())return resolve(getClienteNome());const gate=document.getElementById('nameGate');const input=document.getElementById('clienteNomeInput');const btn=document.getElementById('clienteNomeBtn');gate.hidden=false;setTimeout(()=>input.focus(),50);const done=()=>{const n=(input.value||'').trim();if(!n){input.focus();return;}setClienteNome(n);gate.hidden=true;fetch('/api/mesas/'+token+'/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clienteNome:n})}).catch(()=>{});resolve(n);};btn.addEventListener('click',done);input.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();done();}});});}
// Status legíveis para o cliente
const STATUS_LABEL={
  recebido:'Na cozinha',
  em_producao:'Preparando',
  concluido:'Pronto',
  entregue:'Entregue',
};
const STATUS_TOAST={
  recebido:'Pedido chegou na cozinha',
  em_producao:'Pedido em preparo',
  concluido:'Pedido pronto — o garçom já vai levar',
  entregue:'Pedido entregue na mesa',
};
const br=n=>'R$ '+Number(n).toFixed(2).replace('.',',');
const esc=(s)=>{if(window.SafeDOM&&typeof SafeDOM.escapeHtml==='function')return SafeDOM.escapeHtml(s);return String(s??'').replace(/[&<>"']/g,m=>({'&':'&','<':'<','>':'>','"':'"',"'":'&#039;'}[m]));};
function cartCount(){return cart.reduce((s,i)=>s+i.qty,0);}
function cartTotal(){return cart.reduce((s,i)=>s+itemTotal(i),0);}
function updateCartPill(){const n=cartCount();const badge=document.getElementById('cartBadge');if(badge){badge.textContent=n;badge.classList.toggle('show',n>0);}const total=totalDevido||(sessaoData&&sessaoData.totalDevido)||0;const contaBadge=document.getElementById('contaBadge');if(contaBadge){contaBadge.textContent=total>0?'•':'$';contaBadge.classList.toggle('show',total>0||(sessaoData&&(sessaoData.pedidos||[]).length>0));}}
function showToast(message,ms=1800){const toast=document.getElementById('toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>toast.classList.remove('show'),ms);}
function bounceBurger(){const btn=document.getElementById('burgerBtn');if(!btn)return;btn.classList.remove('pop');void btn.offsetWidth;btn.classList.add('pop');clearTimeout(bounceBurger._t);bounceBurger._t=setTimeout(()=>btn.classList.remove('pop'),600);}
function productNeedsCustom(p){return !!((p.adicionais&&p.adicionais.length)||(p.removiveis&&p.removiveis.length));}
function productIsEscolha(p,catNome){
  if(!p||!(p.adicionais&&p.adicionais.length))return false;
  const cat=String(catNome||p._catNome||'').toLowerCase();
  if(/bebida|drink|refri|suco|agua|cerveja|energ/.test(cat))return true;
  return !(p.removiveis&&p.removiveis.length);
}
function itemKey(productId,additions,removals,note){return productId+'|'+[...additions].map(a=>a.id).sort().join(',')+'|'+(removals||[]).slice().sort().join(',')+'|'+(note||'');}
function itemTotal(i){const p=produtos.find(x=>x.id===i.productId);if(!p)return 0;const add=i.additions.reduce((s,a)=>s+Number(a.preco||0),0);return (Number(p.preco)+add)*i.qty;}
function notifyStatusChanges(pedidos){
  if(!Array.isArray(pedidos))return;
  const next={};
  for(const p of pedidos){
    next[p.id]=p.status;
    const prev=lastStatusMap[p.id];
    if(prev&&prev!==p.status){
      const msg=STATUS_TOAST[p.status]||('Pedido #'+p.id+' → '+(STATUS_LABEL[p.status]||p.status));
      showToast('#'+p.id+' · '+msg,3200);
    }
  }
  lastStatusMap=next;
}
async function loadSessao(){try{const r=await fetch('/api/mesas/'+token+'/sessao');if(!r.ok)return;const s=await r.json();sessaoData=s;window.sessaoData=s;totalDevido=s.totalDevido||0;notifyStatusChanges(s.pedidos||[]);document.getElementById('mesaDesk').textContent='Mesa '+s.mesa+(getClienteNome()?' · '+getClienteNome():' · Cardápio');updateCartPill();if(sessaoOpen)openSessao();}catch(_){}}
async function cancelarPedido(pedidoId){
  if(!confirm('Cancelar o pedido #'+pedidoId+'? Só dá enquanto a cozinha ainda não começou o preparo.'))return;
  try{
    const r=await fetch('/api/mesas/'+token+'/pedidos/'+pedidoId,{method:'DELETE'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){alert(d.error||'Não foi possível cancelar');return;}
    showToast('Pedido #'+pedidoId+' cancelado',2800);
    await loadSessao();
  }catch(e){alert('Falha de rede');}
}
function iniciarEdicaoPedido(pedidoId){
  const s=sessaoData||{};
  const p=(s.pedidos||[]).find(x=>Number(x.id)===Number(pedidoId));
  if(!p||p.status!=='recebido'){alert('Só é possível editar antes da cozinha começar o preparo.');return;}
  // Carrega itens no carrinho para o cliente ajustar e reenviar via PUT
  cart=[];
  for(const it of (p.itens||[])){
    const productId=it.produtoId||it.produto_id;
    const additions=(it.adicionais||[]).map(a=>({id:a.id,nome:a.nome,preco:Number(a.preco||0)}));
    const removals=it.remocoes||it.removals||[];
    const note=it.observacao||'';
    const key=itemKey(productId,additions,removals,note);
    cart.push({key,productId,qty:it.quantidade||1,additions,removals,note,_editPedidoId:pedidoId});
  }
  window._editandoPedidoId=pedidoId;
  updateCartPill();
  closeModal();
  openCart();
  showToast('Edite o pedido e toque em Salvar alterações',3500);
}
function openSessao(){
  sessaoOpen=true;cartOpen=false;
  const s=sessaoData||{pedidos:[],totalDevido:0,mesa:'—'};
  const pedidos=s.pedidos||[];
  const blocks=pedidos.length?pedidos.slice().reverse().map(p=>{
    const itens=(p.itens||[]).map(it=>`<div class="pedido-item"><div><b>${it.quantidade}× ${esc(it.nome)}</b></div><b>${br(it.totalLinha||0)}</b></div>`).join('');
    const editado=p.editadoEm||p.editado_em?' <span class="status-pill" style="background:#fef3c7;color:#92400e">Editado</span>':'';
    const pode=p.status==='recebido'||p.podeEditar;
    const acoes=pode
      ?`<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn" type="button" onclick="iniciarEdicaoPedido(${p.id})">Editar</button>
          <button class="btn" type="button" style="border-color:#f87171;color:#fca5a5" onclick="cancelarPedido(${p.id})">Cancelar</button>
        </div>`
      :'';
    const nItens=(p.itens||[]).reduce((a,it)=>a+(Number(it.quantidade)||1),0);
    const openDef='';
    return `<div class="pedido-block"><details${openDef}><summary class="pedido-sum">
      <div class="row" style="justify-content:space-between;gap:8px;width:100%;align-items:flex-start">
        <b>#${p.id}</b>
        <span class="pedido-sum-status">
          <span class="status-pill ${esc(p.status)}">${STATUS_LABEL[p.status]||p.status}</span>${editado}
          <span class="expand-hint" aria-hidden="true"><span class="expand-chev">▾</span><span class="expand-label">ver itens</span></span>
        </span>
      </div>
      <div class="muted" style="font-size:.8rem;margin-top:4px">${nItens} item${nItens===1?'':'s'} · ${br(p.totalPedido||0)}</div>
    </summary><div style="margin-top:10px">${itens}<div class="pedido-item"><span class="muted">Subtotal</span><b>${br(p.totalPedido||0)}</b></div>${acoes}</div></details></div>`;
  }).join(''):'<div style="text-align:center;padding:28px;color:#a89f8c">Nenhum pedido ainda.</div>';
  const pago=Number(s.valorPago||0);
  const rest=s.valorRestante!=null?Number(s.valorRestante):Math.max(0,Number(s.totalDevido||0)-pago);
  const totalLine=pago>0.009?`<div class="cart-total-row"><span>Total da conta</span><span>${br(s.totalDevido||0)}</span></div><div class="cart-total-row" style="font-size:.95rem;opacity:.9"><span>Já pago</span><span>${br(pago)}</span></div><div class="cart-total-row"><span>A pagar</span><span>${br(rest)}</span></div>`:`<div class="cart-total-row"><span>Total</span><span>${br(s.totalDevido||0)}</span></div>`;
  document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>Conta da mesa ${esc(String(s.mesa??''))}</h2>${totalLine}${blocks}</div></div>`;
  document.body.classList.add('modal-open');
}
function togglePedir(){if(cartOpen){closeModal();return;}openCart();}
function toggleConta(){if(sessaoOpen){closeModal();return;}openSessao();}
async function loadCardapio(){const r=await fetch('/api/cardapio');if(!r.ok){document.getElementById('menu').innerHTML='<div style="padding:20px;color:#a89f8c">Não foi possível carregar o cardápio.</div>';return;}categorias=await r.json();produtos=categorias.flatMap(c=>c.produtos||[]);await loadDestaques();renderMenu();}
let mesaCatFilter='all';
let mesaDestaques=null; // null=loading, []=vazio, array=itens
let mesaDestaquesMsg='';
let mesaSearch='';

const FIRST_MSGS=[
  'Parabéns — você é o primeiro cliente do dia. Ainda sem sugestões por aqui!',
  'O dia mal começou e você já chegou: sem ranking ainda, escolha o que der vontade.',
  'Pista livre: ainda não rolou venda hoje. Você abre o placar!',
  'Sugestões do dia? Ainda no forno. Enquanto isso, o cardápio está todo seu.',
  'Silêncio no placar de vendas… por enquanto. Que tal ser o nº 1 de hoje?',
];
function randomFirstMsg(){
  return FIRST_MSGS[Math.floor(Math.random()*FIRST_MSGS.length)];
}
async function loadDestaques(){
  try{
    const r=await fetch('/api/cardapio/destaques?limit=6');
    if(!r.ok){mesaDestaques=[];mesaDestaquesMsg=randomFirstMsg();return;}
    const d=await r.json();
    const itens=Array.isArray(d.itens)?d.itens:[];
    mesaDestaques=itens;
    mesaDestaquesMsg=itens.length? '':randomFirstMsg();
  }catch(_){
    mesaDestaques=[];
    mesaDestaquesMsg=randomFirstMsg();
  }
}

const CAT_ICONS={
  'Hot Dogs':'🌭','Sanduíches':'🍔','Porções':'🍟','Bebidas':'🥤','Drinks':'🍸',
  'Energéticos':'⚡','Cervejas':'🍺','Combos':'🧺','Sobremesas':'🍨'
};
function demoPhoto(p, catNome){
  const nome=String(p.nome||'').toLowerCase();
  const cat=String(catNome||p._catNome||'').toLowerCase();
  // Hot dogs — um arquivo por tipo (sem confundir com outras comidas)
  if(/dog\s*bacon|dog-bacon/.test(nome)) return '/assets/demo/dog-bacon.jpg';
  if(/vegetariano|vegano/.test(nome)) return '/assets/demo/dog-veg.jpg';
  if(/dog\s*especial|especial da casa/.test(nome)) return '/assets/demo/dog-especial.jpg';
  if(/dog\s*duplo|duplo/.test(nome) && /dog/.test(nome)) return '/assets/demo/dog-duplo.jpg';
  if(/dog\s*tradicional|hot\s*dog|dog /.test(nome) || (/dog/.test(nome) && /hot/.test(cat))) return '/assets/demo/dog-classic.jpg';
  if(/dog/.test(nome)) return '/assets/demo/dog-classic.jpg';
  // Sanduíches
  if(/x-bacon/.test(nome)) return '/assets/demo/xbacon.jpg';
  if(/x-salada/.test(nome)) return '/assets/demo/salad.jpg';
  if(/x-tudo/.test(nome)) return '/assets/demo/burger.jpg';
  if(/x-frango|frango grelhado/.test(nome)) return '/assets/demo/chicken.jpg';
  if(/misto/.test(nome)) return '/assets/demo/misto.jpg';
  if(/natural/.test(nome)) return '/assets/demo/natural.jpg';
  if(/x-|sandu|burger|hamb/.test(nome)) return '/assets/demo/burger.jpg';
  // Porções
  if(/onion|anel/.test(nome)) return '/assets/demo/onion.jpg';
  if(/polenta/.test(nome)) return '/assets/demo/polenta.jpg';
  if(/mandioca/.test(nome)) return '/assets/demo/mandioca.jpg';
  if(/passarinho/.test(nome)) return '/assets/demo/chicken.jpg';
  if(/batata/.test(nome)) return '/assets/demo/fries.jpg';
  // Combos
  if(/combo/.test(nome)) return '/assets/demo/combo.jpg';
  // Bebidas
  if(/coca|cola/.test(nome)) return '/assets/demo/soda-cola.jpg';
  if(/fanta|guaran|sprite/.test(nome)) return '/assets/demo/soda-orange.jpg';
  if(/refrigerante/.test(nome)) return '/assets/demo/soda-cola.jpg';
  if(/suco/.test(nome)) return '/assets/demo/juice.jpg';
  if(/água|agua|coco/.test(nome)) return '/assets/demo/water.jpg';
  if(/milk|shake/.test(nome)) return '/assets/demo/milkshake.jpg';
  // Drinks / energy / beer
  if(/caipi/.test(nome)) return '/assets/demo/caipi.jpg';
  if(/gin|moscow|mule|vodka|drink/.test(nome)) return '/assets/demo/cocktail.jpg';
  if(/energ|red bull|monster|tnt|baly/.test(nome)) return '/assets/demo/energy.jpg';
  if(/cerveja|chopp|long neck|balde|ipa|pilsen|malte/.test(nome)) return '/assets/demo/beer.jpg';
  // Sobremesas
  if(/churros/.test(nome)) return '/assets/demo/churros.jpg';
  if(/brownie/.test(nome)) return '/assets/demo/brownie.jpg';
  if(/petit|gateau/.test(nome)) return '/assets/demo/petit.jpg';
  if(/sobremesa|sorvete/.test(nome) || /sobremesa/.test(cat)) return '/assets/demo/dessert.jpg';
  if(/bebida|refri/.test(cat)) return '/assets/demo/drink.jpg';
  return '/assets/demo/burger.jpg';
}
function productPhotoUrl(p, catNome){
  const u=p.fotoUrl||p.foto_url||'';
  // fotos quebradas / antigas de upload local → usa demo
  if(!u || u.startsWith('/uploads/') || u.startsWith('data:image') && u.length<80) return demoPhoto(p, catNome);
  return u;
}
function setMesaCat(id){
  mesaCatFilter=String(id||'all');
  renderMenu();
}
function setMesaSearch(q){
  mesaSearch=String(q||'');
  renderMenu();
  const input=document.getElementById('mesaSearchInput');
  if(input && document.activeElement!==input){/* keep */;}
  const box=document.getElementById('mesaSearchBox');
  if(box) box.classList.toggle('has-value', !!mesaSearch.trim());
}
function clearMesaSearch(){
  mesaSearch='';
  const input=document.getElementById('mesaSearchInput');
  if(input) input.value='';
  setMesaSearch('');
}
function renderMenu(){
  const chips=[{id:'all',nome:'Todos',ico:'✨'}].concat(
    categorias.map(c=>({id:String(c.id),nome:c.nome,ico:CAT_ICONS[c.nome]||'🍽️'}))
  );
  const chipsHtml='<div class="cat-chips" role="tablist">'+chips.map(ch=>{
    const on=String(mesaCatFilter)===String(ch.id);
    return `<button type="button" class="cat-chip${on?' active':''}" role="tab" aria-selected="${on}" onclick="setMesaCat('${esc(ch.id)}')"><span class="chip-ico" aria-hidden="true">${ch.ico}</span><span class="chip-label">${esc(ch.nome)}</span></button>`;
  }).join('')+'</div>';

  const q=mesaSearch.trim().toLowerCase();
  const searchHtml=`<div class="mesa-search${q?' has-value':''}" id="mesaSearchBox">
    <span class="search-ico" aria-hidden="true">🔍</span>
    <input id="mesaSearchInput" type="search" placeholder="Buscar no cardápio…" value="${esc(mesaSearch)}" autocomplete="off" enterkeyhint="search">
    <button type="button" class="search-clear" aria-label="Limpar busca" onclick="clearMesaSearch()">×</button>
  </div>`;

  let list=[];
  for(const c of categorias){
    if(mesaCatFilter!=='all' && String(c.id)!==String(mesaCatFilter)) continue;
    for(const p of (c.produtos||[])){
      p._catNome=c.nome;
      if(q){
        const hay=(String(p.nome)+' '+String(p.descricao||'')+' '+String(c.nome)).toLowerCase();
        if(!hay.includes(q)) continue;
      }
      list.push({p,c});
    }
  }
  const title=q
    ? (`Resultados`+(list.length?` · ${list.length}`:''))
    : (mesaCatFilter==='all'?'Cardápio':(categorias.find(c=>String(c.id)===String(mesaCatFilter))||{}).nome||'Cardápio');

  let sugHtml='';
  if(!q && mesaCatFilter==='all'){
    if(mesaDestaques===null){
      sugHtml='';
    }else if(mesaDestaques.length){
      const cards=mesaDestaques.map(it=>{
        const foto=productPhotoUrl(it, '');
        return `<article class="sug-card">
          <div class="sug-card__media"><img src="${esc(foto)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/assets/demo/burger.jpg'"></div>
          <div class="sug-card__body">
            <h3>${esc(it.nome)}</h3>
            <div class="price">${br(it.preco)}</div>
            <button type="button" class="btn-add" onclick="quickAdd(${it.id})">+ Adicionar</button>
          </div>
        </article>`;
      }).join('');
      sugHtml=`<section class="mesa-sugestoes" aria-label="Mais pedidos hoje">
        <div class="mesa-sugestoes__head"><h2>🔥 Mais pedidos hoje</h2></div>
        <div class="mesa-sugestoes__scroll">${cards}</div>
      </section>`;
    }else{
      sugHtml=`<div class="mesa-first-msg">${esc(mesaDestaquesMsg||randomFirstMsg())}</div>`;
    }
  }

  const cards=list.length?list.map(({p,c})=>{
    const escolha=productIsEscolha(p,c.nome);
    const custom=productNeedsCustom(p);
    const foto=productPhotoUrl(p,c.nome);
    let actions;
    if(escolha){
      actions=`<button class="btn-add ghost" type="button" onclick="openCustomize(${p.id})" title="Escolher">Escolher</button>`;
    }else if(custom){
      actions=`<div class="prod-card__actions"><button class="btn-add" type="button" onclick="quickAdd(${p.id})" title="Adicionar" aria-label="Adicionar">+</button><button class="btn-add ghost" type="button" onclick="openCustomize(${p.id})" title="Personalizar">✎</button></div>`;
    }else{
      actions=`<button class="btn-add" type="button" onclick="quickAdd(${p.id})" title="Adicionar" aria-label="Adicionar">+</button>`;
    }
    return `<article class="prod-card">
      <div class="prod-card__media"><img src="${esc(foto)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/assets/demo/burger.jpg'"></div>
      <div class="prod-card__body">
        <h3>${esc(p.nome)}</h3>
        <p class="desc">${esc(p.descricao||'')}</p>
        <div class="prod-card__row"><span class="price">${br(p.preco)}</span>${actions}</div>
      </div>
    </article>`;
  }).join(''):'<div class="mesa-empty">Nenhum item nesta categoria.</div>';

  document.getElementById('menu').innerHTML=
    searchHtml+
    chipsHtml+
    sugHtml+
    `<h2 class="mesa-section-title">${esc(title)}</h2>`+
    `<div class="prod-grid">${cards}</div>`;
  const input=document.getElementById('mesaSearchInput');
  if(input){
    input.addEventListener('input',()=>setMesaSearch(input.value));
    // restore focus/caret after re-render while typing
    if(mesaSearch){
      const len=input.value.length;
      input.focus();
      try{input.setSelectionRange(len,len);}catch(_){}
    }
  }
}
function quickAdd(id){const p=produtos.find(x=>x.id===id);if(!p)return;const key=itemKey(id,[],[],'');const existing=cart.find(x=>x.key===key);if(existing)existing.qty+=1;else cart.push({key,productId:id,qty:1,additions:[],removals:[],note:''});updateCartPill();bounceBurger();showToast(p.nome+' adicionado');}
let customizeDraft=null;
function openCustomize(id){const p=produtos.find(x=>x.id===id);if(!p)return;const escolha=productIsEscolha(p);customizeDraft={productId:id,qty:1,additions:[],removals:[],note:'',ponto:null,escolha};if(escolha&&p.adicionais&&p.adicionais.length===1){const a0=p.adicionais[0];customizeDraft.additions=[{id:a0.id,nome:a0.nome,preco:Number(a0.preco)}];}renderCustomizeModal();}
function closeModal(){document.getElementById('modal').innerHTML='';document.body.classList.remove('modal-open');cartOpen=false;sessaoOpen=false;customizeDraft=null;}
