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
  // Preserva quais cards estavam abertos (loadSessao/realtime re-renderizam)
  const openIds=new Set(window._contaOpenPedidos||[]);
  if(!window._contaOpenPedidos){
    document.querySelectorAll('.pedido-block details[open][data-pedido-id]').forEach(function(d){
      openIds.add(String(d.getAttribute('data-pedido-id')));
    });
  }
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
    const firstNome=(p.itens&&p.itens[0]&&p.itens[0].nome)?p.itens[0].nome:'Pedido';
    const quem=p.clienteNome||p.cliente_nome||'';
    const titulo=quem?`${firstNome} · ${quem}`:firstNome;
    const isOpen=openIds.has(String(p.id));
    const openDef=isOpen?' open':'';
    return `<div class="pedido-block"><details class="pedido-details" data-pedido-id="${p.id}"${openDef}>
      <summary class="pedido-sum">
      <div class="row" style="justify-content:space-between;gap:8px;width:100%;align-items:flex-start">
        <b class="pedido-title">${esc(titulo)}</b>
        <span class="pedido-sum-status">
          <span class="status-pill ${esc(p.status)}">${STATUS_LABEL[p.status]||p.status}</span>${editado}
          <span class="expand-hint" aria-hidden="true"><span class="expand-chev">▾</span><span class="expand-label">ver itens</span></span>
        </span>
      </div>
      <div class="muted" style="font-size:.8rem;margin-top:4px">${nItens} item${nItens===1?'':'s'} · ${br(p.totalPedido||0)}</div>
    </summary>
    <div class="pedido-body" style="margin-top:10px">
      ${itens}
      <div class="pedido-item"><span class="muted">Subtotal do pedido</span><b>${br(p.totalPedido||0)}</b></div>
      <div class="pix-pedido" data-valor="${Number(p.totalPedido||0).toFixed(2)}" data-pedido-id="${p.id}"></div>
      ${acoes}
    </div>
    </details></div>`;
  }).join(''):'<div style="text-align:center;padding:28px;color:#a89f8c">Nenhum pedido ainda.</div>';
  const pago=Number(s.valorPago||0);
  const rest=s.valorRestante!=null?Number(s.valorRestante):Math.max(0,Number(s.totalDevido||0)-pago);
  const totalLine=pago>0.009?`<div class="cart-total-row"><span>Total da conta</span><span>${br(s.totalDevido||0)}</span></div><div class="cart-total-row" style="font-size:.95rem;opacity:.9"><span>Já pago</span><span>${br(pago)}</span></div><div class="cart-total-row"><span>A pagar</span><span>${br(rest)}</span></div>`:`<div class="cart-total-row"><span>Total da conta</span><span>${br(s.totalDevido||0)}</span></div>`;
  document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet conta-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>Conta da mesa ${esc(String(s.mesa??''))}</h2>${blocks}<div class="conta-total-block">${totalLine}<div class="pix-mesa-total" data-valor="${rest.toFixed(2)}"></div></div></div></div>`;
  document.body.classList.add('modal-open');
  // track open/close without depender de re-fetch
  window._contaOpenPedidos=Array.from(openIds);
  document.querySelectorAll('.pedido-block details[data-pedido-id]').forEach(function(d){
    d.addEventListener('toggle',function(){
      const id=String(d.getAttribute('data-pedido-id'));
      const set=new Set(window._contaOpenPedidos||[]);
      if(d.open) set.add(id); else set.delete(id);
      window._contaOpenPedidos=Array.from(set);
    });
  });
  if(typeof window._afterOpenSessao==='function'){
    try{window._afterOpenSessao(s);}catch(_){}
  }
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
  // Demo coerente por nome até o cliente enviar fotos oficiais
  return demoPhoto(p, catNome);
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

  let sugHtml='';
  if(!q && mesaCatFilter==='all'){
    if(mesaDestaques && mesaDestaques.length){
      const cards=mesaDestaques.map(it=>{
        const full=produtos.find(x=>Number(x.id)===Number(it.id))||it;
        const foto=productPhotoUrl(full, full._catNome||'');
        const custom=productNeedsCustom(full);
        const escolha=productIsEscolha(full, full._catNome||'');
        let actions;
        if(escolha){
          actions=`<button type="button" class="btn-add ghost" onclick="event.stopPropagation();openCustomize(${full.id})">Escolher</button>`;
        }else if(custom){
          actions=`<div class="sug-actions">
            <button type="button" class="btn-add" onclick="event.stopPropagation();quickAdd(${full.id})">+</button>
            <button type="button" class="btn-add ghost" onclick="event.stopPropagation();openCustomize(${full.id})">✎</button>
          </div>`;
        }else{
          actions=`<button type="button" class="btn-add" onclick="event.stopPropagation();quickAdd(${full.id})">+ Adicionar</button>`;
        }
        return `<article class="sug-card" role="button" tabindex="0" onclick="openProductDetail(${full.id})">
          <div class="sug-card__media"><img src="${esc(foto)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/assets/demo/burger.jpg'"></div>
          <div class="sug-card__body">
            <h3>${esc(full.nome||it.nome)}</h3>
            <div class="price">${br(full.preco!=null?full.preco:it.preco)}</div>
            ${actions}
          </div>
        </article>`;
      }).join('');
      sugHtml=`<section class="mesa-sugestoes" aria-label="Mais pedidos hoje">
        <div class="mesa-sugestoes__head"><h2>🔥 Mais pedidos hoje</h2></div>
        <div class="mesa-sugestoes__scroll">${cards}</div>
      </section>`;
    }else if(mesaDestaques!==null){
      sugHtml=`<div class="mesa-first-msg">${esc(mesaDestaquesMsg||randomFirstMsg())}</div>`;
    }
  }

  function cardHtml(p, c){
    const escolha=productIsEscolha(p,c.nome);
    const custom=productNeedsCustom(p);
    const foto=productPhotoUrl(p,c.nome);
    let actions;
    if(escolha){
      actions=`<button class="btn-add ghost" type="button" onclick="event.stopPropagation();openCustomize(${p.id})" title="Escolher">Escolher</button>`;
    }else if(custom){
      actions=`<div class="prod-card__actions"><button class="btn-add" type="button" onclick="event.stopPropagation();quickAdd(${p.id})" title="Adicionar" aria-label="Adicionar">+</button><button class="btn-add ghost" type="button" onclick="event.stopPropagation();openCustomize(${p.id})" title="Personalizar">✎</button></div>`;
    }else{
      actions=`<button class="btn-add" type="button" onclick="event.stopPropagation();quickAdd(${p.id})" title="Adicionar" aria-label="Adicionar">+</button>`;
    }
    return `<article class="prod-card" role="button" tabindex="0" onclick="openProductDetail(${p.id})">
      <div class="prod-card__media"><img src="${esc(foto)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/demo/dog-classic.jpg'"></div>
      <div class="prod-card__body">
        <h3>${esc(p.nome)}</h3>
        <div class="prod-card__row"><span class="price">${br(p.preco)}</span>${actions}</div>
      </div>
    </article>`;
  }

  let bodyHtml='';
  if(q){
    let list=[];
    for(const c of categorias){
      for(const p of (c.produtos||[])){
        p._catNome=c.nome;
        const hay=(String(p.nome)+' '+String(p.descricao||'')+' '+String(c.nome)).toLowerCase();
        if(!hay.includes(q)) continue;
        list.push({p,c});
      }
    }
    const cards=list.length?list.map(({p,c})=>cardHtml(p,c)).join(''):'<div class="mesa-empty">Nenhum item encontrado.</div>';
    bodyHtml=`<h2 class="mesa-section-title">Resultados${list.length?` · ${list.length}`:''}</h2><div class="prod-grid">${cards}</div>`;
  }else{
    const cats=categorias.filter(c=>mesaCatFilter==='all'||String(c.id)===String(mesaCatFilter));
    bodyHtml=cats.map(c=>{
      const prods=(c.produtos||[]).map(p=>{p._catNome=c.nome;return p;});
      if(!prods.length) return '';
      const cards=prods.map(p=>cardHtml(p,c)).join('');
      return `<section class="cat-section">
        <h2 class="mesa-section-title">${esc(c.nome)}</h2>
        <div class="prod-grid">${cards}</div>
      </section>`;
    }).join('')||'<div class="mesa-empty">Nenhum item nesta categoria.</div>';
  }

  document.getElementById('menu').innerHTML=
    searchHtml+
    chipsHtml+
    sugHtml+
    bodyHtml;
  const input=document.getElementById('mesaSearchInput');
  if(input){
    input.addEventListener('input',()=>setMesaSearch(input.value));
    if(mesaSearch){
      const len=input.value.length;
      input.focus();
      try{input.setSelectionRange(len,len);}catch(_){}
    }
  }
}

function openProductDetail(id){
  const p=produtos.find(x=>Number(x.id)===Number(id));
  if(!p)return;
  const escolha=productIsEscolha(p,p._catNome);
  const custom=productNeedsCustom(p);
  const foto=productPhotoUrl(p,p._catNome);
  let actions;
  if(escolha){
    actions=`<button class="btn primary btn-chip full" type="button" onclick="closeModal();openCustomize(${p.id})">Escolher opções</button>`;
  }else if(custom){
    actions=`<div class="detail-actions">
      <button class="btn primary btn-chip" type="button" onclick="quickAdd(${p.id});closeModal()">+ Adicionar</button>
      <button class="btn btn-chip" type="button" onclick="closeModal();openCustomize(${p.id})">Personalizar</button>
    </div>`;
  }else{
    actions=`<button class="btn primary btn-chip full" type="button" onclick="quickAdd(${p.id});closeModal()">+ Adicionar ao pedido</button>`;
  }
  const root=document.getElementById('modal');
  root.innerHTML=`
    <div class="modal-root product-detail-root" role="dialog" aria-modal="true">
      <div class="modal-backdrop product-detail-backdrop" onclick="closeModal()"></div>
      <div class="modal-sheet product-detail-sheet">
        <button class="close" type="button" onclick="closeModal()" aria-label="Fechar">×</button>
        <div class="product-detail-media">
          <img src="${esc(foto)}" alt="" width="640" height="440" decoding="async" fetchpriority="high" onerror="this.onerror=null;this.src='/assets/demo/burger.jpg'">
        </div>
        <div class="product-detail-body">
          <h2>${esc(p.nome)}</h2>
          <p class="muted detail-desc">${esc(p.descricao||'Sem descrição.')}</p>
          <div class="price detail-price">${br(p.preco)}</div>
          ${actions}
        </div>
      </div>
    </div>`;
  document.body.classList.add('modal-open');
  cartOpen=false;sessaoOpen=false;customizeDraft=null;
}

function quickAdd(id){const p=produtos.find(x=>x.id===id);if(!p)return;const key=itemKey(id,[],[],'');const existing=cart.find(x=>x.key===key);if(existing)existing.qty+=1;else cart.push({key,productId:id,qty:1,additions:[],removals:[],note:''});updateCartPill();bounceBurger();showToast(p.nome+' adicionado');}
let customizeDraft=null;
function openCustomize(id){const p=produtos.find(x=>x.id===id);if(!p)return;const escolha=productIsEscolha(p);customizeDraft={productId:id,qty:1,additions:[],removals:[],note:'',ponto:null,escolha};if(escolha&&p.adicionais&&p.adicionais.length===1){const a0=p.adicionais[0];customizeDraft.additions=[{id:a0.id,nome:a0.nome,preco:Number(a0.preco)}];}renderCustomizeModal();}
function closeModal(){document.getElementById('modal').innerHTML='';document.body.classList.remove('modal-open');cartOpen=false;sessaoOpen=false;customizeDraft=null;}
