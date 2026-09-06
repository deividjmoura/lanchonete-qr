const token=location.pathname.split('/').filter(Boolean).pop()||'';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!UUID_RE.test(token)){document.body.innerHTML='<p style="padding:2rem;font-family:system-ui">QR inválido.</p>';throw new Error('token');}

let cart=[];
let produtos=[];
let categorias=[];
let sessaoData=null;
let totalDevido=0;
let sessaoOpen=false;
let lastStatusMap={};
let clienteNome='';
let mesaCatActive='';
let mesaDestaques=[];
let mesaDestaquesMsg='';

const lqPageId=()=>location.pathname.split('/').filter(Boolean).pop()||'';
function lqGetJson(key, fallback){
  try{
    const raw=sessionStorage.getItem(key);
    if(raw==null)return fallback;
    return JSON.parse(raw);
  }catch(_){ return fallback; }
}
function lqSetJson(key, val){
  try{ sessionStorage.setItem(key, JSON.stringify(val)); }catch(_){}
}
function lqLoadContaOpen(){
  const token=(location.pathname.split('/').filter(Boolean).pop())||'';
  return lqGetJson('lq-conta-open-'+token+'-'+lqPageId(), []);
}
function lqSaveContaOpen(ids){
  const token=(location.pathname.split('/').filter(Boolean).pop())||'';
  lqSetJson('lq-conta-open-'+token+'-'+lqPageId(), Array.from(ids||[]));
}
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
const esc=(s)=>{if(window.SafeDOM&&typeof SafeDOM.escapeHtml==='function')return SafeDOM.escapeHtml(s);return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));};
function cartCount(){return cart.reduce((s,i)=>s+i.qty,0);}
function cartTotal(){return cart.reduce((s,i)=>s+itemTotal(i),0);}
function updateCartPill(){const n=cartCount();const badge=document.getElementById('cartBadge');if(badge){badge.textContent=n;badge.classList.toggle('show',n>0);}const total=totalDevido||(sessaoData&&sessaoData.totalDevido)||0;const contaBadge=document.getElementById('contaBadge');if(contaBadge){contaBadge.textContent=total>0?'•':'$';contaBadge.classList.toggle('show',total>0||(sessaoData&&(sessaoData.pedidos||[]).length>0));}}
function productNeedsCustom(p){return !!((p.adicionais&&p.adicionais.length)||(p.removiveis&&p.removiveis.length));}
function productIsEscolha(p,catNome){
  if(!p||!(p.adicionais&&p.adicionais.length))return false;
  const cat=String(catNome||p._catNome||'').toLowerCase();
  if(/bebida|drink|refri|suco|agua|cerveja|energ|dose|long\s*neck|caipirinha|gin|doses/.test(cat))return true;
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
async function loadSessao(){try{const r=await fetch('/api/mesas/'+token+'/sessao');if(!r.ok)return;const s=await r.json();sessaoData=s;window.sessaoData=s;totalDevido=s.totalDevido||0;notifyStatusChanges(s.pedidos||[]);document.getElementById('mesaDesk').textContent='Mesa '+s.mesa+(getClienteNome()?' · '+getClienteNome():' · Cardápio');updateCartPill();if(sessaoOpen){const openIds=[...document.querySelectorAll('.pedido-block details[open][data-pedido-id]')].map(d=>String(d.getAttribute('data-pedido-id')));if(openIds.length||!window._contaOpenPedidos){window._contaOpenPedidos=openIds.length?openIds:(window._contaOpenPedidos||[]);}openSessao();}}catch(_){}}
async function cancelarPedido(pedidoId){
  if(!confirm('Cancelar o pedido #'+pedidoId+'? Só dá enquanto a cozinha ainda não começou o preparo.'))return;
  try{
    const r=await fetch('/api/mesas/'+token+'/pedidos/'+pedidoId,{method:'DELETE'});
    if(!r.ok){const e=await r.json().catch(()=>({}));showToast(e.error||'Não foi possível cancelar',2800);return;}
    showToast('Pedido cancelado',2200);
    await loadSessao();
  }catch(_){showToast('Erro de rede ao cancelar',2800);}
}
function openSessao(){
  sessaoOpen=true;
  const s=sessaoData||{mesa:'?',pedidos:[],totalDevido:0};
  const pedidos=s.pedidos||[];
  const openSet=new Set((window._contaOpenPedidos||lqLoadContaOpen()||[]).map(String));
  const blocks=pedidos.length?pedidos.map(p=>{
    const itens=(p.itens||[]).map(it=>`<div class="pedido-item"><div><b>${it.quantidade}× ${esc(it.nome)}</b></div><b>${br(it.totalLinha||0)}</b></div>`).join('');
    const canCancel=p.status==='recebido';
    const editado=p.editado?' <span class="muted" style="font-size:.75rem">(editado)</span>':'';
    const openAttr=openSet.has(String(p.id))?' open':'';
    const titulo=p.numero?('#'+p.numero):('#'+p.id);
    return `<details class="pedido-block" data-pedido-id="${p.id}"${openAttr}>
      <summary class="pedido-sum">
        <b class="pedido-title">${esc(titulo)}</b>
        <span class="pedido-meta">
          <span class="status-pill ${esc(p.status)}">${STATUS_LABEL[p.status]||p.status}</span>${editado}
          <span class="pedido-valor">${br(p.totalPedido||0)}</span>
          <span class="expand-hint" aria-hidden="true"><span class="expand-chev">▾</span></span>
        </span>
      </summary>
      <div class="pedido-body">
        ${itens||'<p class="muted">Sem itens</p>'}
        ${canCancel?`<button type="button" class="btn-ghost" style="margin-top:10px" onclick="cancelarPedido(${p.id})">Cancelar pedido</button>`:''}
      </div>
    </details>`;
  }).join(''):'<p class="muted">Nenhum pedido ainda.</p>';
  const totalLine=`<div class="conta-total"><span>Total da mesa</span><b>${br(s.totalDevido||0)}</b></div>`;
  const rest=Number(s.totalDevido||0);
  document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet conta-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>Conta da mesa ${esc(String(s.mesa??''))}</h2>${blocks}<div class="conta-total-block">${totalLine}<p class="muted" style="font-size:.82rem;margin:12px 0 0">Pagamento no caixa ou com o garçom.</p></div></div></div>`;
  // persist open states
  document.querySelectorAll('.pedido-block details[data-pedido-id]').forEach(d=>{
    d.addEventListener('toggle',()=>{
      const ids=[...document.querySelectorAll('.pedido-block details[open][data-pedido-id]')].map(x=>String(x.getAttribute('data-pedido-id')));
      window._contaOpenPedidos=ids;
      lqSaveContaOpen(ids);
    });
  });
}
function closeModal(){
  const openIds=[...document.querySelectorAll('.pedido-block details[open][data-pedido-id]')].map(d=>String(d.getAttribute('data-pedido-id')));
  if(openIds.length){window._contaOpenPedidos=openIds;lqSaveContaOpen(openIds);}
  sessaoOpen=false;
  document.getElementById('modal').innerHTML='';
}
function toggleConta(){if(sessaoOpen){closeModal();return;}openSessao();}
function showToast(msg,ms){
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),ms||2500);
}
async function boot(){
  await ensureClienteNome();
  try{
    const r=await fetch('/api/mesas/'+token+'/cardapio');
    if(!r.ok)throw new Error('cardapio');
    const data=await r.json();
    categorias=data.categorias||[];
    produtos=(data.produtos||[]).map(p=>({...p,_catNome:(categorias.find(c=>String(c.id)===String(p.categoria_id))||{}).nome||''}));
    renderMenu(); // primeiro paint rápido (destaques podem vir depois)
  }catch(e){
    document.getElementById('menuRoot').innerHTML='<p class="mesa-empty">Não foi possível carregar o cardápio.</p>';
  }
  loadSessao();
  setInterval(loadSessao,8000);
  // destaques opcional
  try{
    const rd=await fetch('/api/mesas/'+token+'/destaques');
    if(rd.ok){const d=await rd.json();mesaDestaques=d.itens||[];mesaDestaquesMsg=d.mensagem||'';}
  }catch(_){}
  if(typeof renderMenuBody==='function' && document.getElementById('menuBody')) renderMenuBody();
  else renderMenu();
}

/* ====== CARDÁPIO VISUAL (layout original) ====== */
let mesaSearch='';
function setMesaCat(id){
  mesaCatActive=String(id||'');
  renderMenu();
}
const CAT_ICONS={
  'Hot Dogs':'🌭','Sanduíches':'🍔','Lanches':'🍔','Porções':'🍟','Bebidas':'🥤','Drinks':'🍸',
  'Drinks Sem Álcool':'🍹','Drinks de Gin':'🍸','Drinks Diversos':'🥂','Caipirinhas':'🍋',
  'Doses':'🥃','Cerveja 600ml':'🍺','Long Neck':'🍺','Cervejas':'🍺','Combos':'🧺','Sobremesas':'🍨','Energéticos':'⚡'
};
function demoPhoto(p, catNome){
  /* Item a item — WebP leve e coerente */
  const nome=String(p&&p.nome||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
  const cat=String(catNome||(p&&p._catNome)||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');

  // Combos primeiro (nome contém X-Salada etc.)
  if(/^combo\b|\bcombo\b/.test(nome)) return '/assets/demo/combo.webp';

  // Hot dogs
  if(/dog/.test(nome) && /bacon/.test(nome)) return '/assets/demo/dog-bacon.webp';
  if(/dog/.test(nome) && /especial/.test(nome)) return '/assets/demo/dog-especial.webp';
  if(/dog/.test(nome) && /(vegetariano|vegano)/.test(nome)) return '/assets/demo/dog-veg.webp';
  if(/dog/.test(nome) && /duplo/.test(nome)) return '/assets/demo/dog-duplo.webp';
  if(/dog/.test(nome) || /hot\s*dogs?/.test(cat)) return '/assets/demo/dog-classic.webp';

  // Sanduíches
  if(/x-?\s*bacon|xbacon/.test(nome)) return '/assets/demo/xbacon.webp';
  if(/x-?\s*salada/.test(nome)) return '/assets/demo/salad.webp';
  if(/x-?\s*tudo/.test(nome)) return '/assets/demo/burger.webp';
  if(/frango grelhado|x-?\s*frango/.test(nome)) return '/assets/demo/chicken.webp';
  if(/misto/.test(nome)) return '/assets/demo/misto.webp';
  if(/natural de frango|sanduiche natural|sanduíche natural/.test(nome)) return '/assets/demo/natural.webp';
  if(/sandu|x-|burger|hamb/.test(nome) || /sandu/.test(cat)) return '/assets/demo/burger.webp';

  // Porções
  if(/onion|anel/.test(nome)) return '/assets/demo/onion.webp';
  if(/batata/.test(nome)) return '/assets/demo/fries.webp';
  if(/passarinho/.test(nome)) return '/assets/demo/chicken.webp';
  if(/polenta/.test(nome)) return '/assets/demo/polenta.webp';
  if(/mandioca|aipim/.test(nome)) return '/assets/demo/mandioca.webp';
  if(/porcao|porção|porcoes|porções/.test(cat)) return '/assets/demo/fries.webp';

  // Bebidas / drinks
  if(/coca|guarana|guaraná|fanta|sprite|pepsi|refri|lata/.test(nome) || /bebida|refri/.test(cat)) return '/assets/demo/soda.webp';
  if(/suco/.test(nome)) return '/assets/demo/juice.webp';
  if(/agua|água/.test(nome)) return '/assets/demo/water.webp';
  if(/energet|red bull|monster|tnt/.test(nome) || /energ/.test(cat)) return '/assets/demo/energy.webp';
  if(/cerveja|heineken|bud|brahma|skol|amstel|long\s*neck|600ml/.test(nome) || /cerveja|long\s*neck/.test(cat)) return '/assets/demo/beer.webp';
  if(/gin|caipirinha|dose|smirnoff|vodka|whisky|drink/.test(nome) || /drink|dose|caipirinha|gin/.test(cat)) return '/assets/demo/drink.webp';

  // Sobremesas
  if(/sobremesa|doce|sorvete|brownie|pudim/.test(nome) || /sobremesa/.test(cat)) return '/assets/demo/dessert.webp';

  return '/assets/demo/burger.webp';
}
function productFoto(p, catNome){
  if(p&&p.foto) return p.foto;
  return demoPhoto(p, catNome);
}
function onMesaSearch(q){
  mesaSearch=String(q||'');
  const box=document.getElementById('mesaSearchBox');
  if(box) box.classList.toggle('has-value', !!mesaSearch.trim());
  renderMenuBody();
}
function clearMesaSearch(){
  mesaSearch='';
  const input=document.getElementById('mesaSearchInput');
  if(input) input.value='';
  onMesaSearch('');
}
function filterProds(list){
  const q=mesaSearch.trim().toLowerCase();
  if(!q) return list;
  return list.filter(p=>{
    const nome=(p.nome||'').toLowerCase();
    const desc=(p.descricao||'').toLowerCase();
    return nome.includes(q) || desc.includes(q);
  });
}
function renderSugestoes(){
  if(!mesaDestaques||!mesaDestaques.length) return '';
  let sugHtml='';
  if(mesaDestaques.length){
    const cards=mesaDestaques.slice(0,8).map(it=>{
      const full=produtos.find(p=>String(p.id)===String(it.id||it.produto_id))||it;
      const foto=productFoto(full, full._catNome||'');
      const escolha=productIsEscolha(full, full._catNome||'');
      return `<article class="sug-card" onclick="openProduct(${full.id})">
          <div class="sug-card__media"><img src="${esc(foto)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/assets/demo/burger.webp'"></div>
          <div class="sug-card__body">
            <h3>${esc(full.nome||it.nome)}</h3>
            <div class="sug-card__price">${br(full.preco||it.preco||0)}</div>
          </div>
        </article>`;
    }).join('');
    sugHtml=`<section class="mesa-sugestoes"><h2 class="mesa-section-title">Destaques</h2><div class="sug-scroll">${cards}</div></section>`;
  } else if(mesaDestaquesMsg){
    sugHtml=`<p class="mesa-empty" style="margin:8px 0 16px">${esc(mesaDestaquesMsg)}</p>`;
  }
  return sugHtml;
}
function renderCatSection(c){
  const prods=filterProds((produtos||[]).filter(p=>String(p.categoria_id)===String(c.id)));
  if(!prods.length) return '';
  const many=prods.length>=4;
  const cards=prods.map(p=>{
    const foto=productFoto(p,c.nome);
    const escolha=productIsEscolha(p,c.nome);
    return `<article class="prod-card" data-id="${p.id}" onclick="openProduct(${p.id})">
      <div class="prod-card__media"><img src="${esc(foto)}" alt="" width="320" height="280" loading="lazy" decoding="async" fetchpriority="low" onerror="this.onerror=null;this.src='/assets/demo/burger.webp'"></div>
      <div class="prod-card__body">
        <h3>${esc(p.nome)}</h3>
        <p class="desc">${esc(p.descricao||'')}</p>
        <div class="prod-card__footer">
          <span class="price">${br(p.preco)}</span>
          <button type="button" class="btn-add" aria-label="Adicionar">+</button>
        </div>
      </div>
    </article>`;
  }).join('');
  const listClass=many?'prod-scroll prod-scroll--2row':'prod-grid prod-grid--few';
  return `<section class="mesa-cat" data-cat="${c.id}">
          <h2 class="mesa-section-title">${esc(c.nome)}</h2>
          <div class="${listClass}">${cards}</div>
        </section>`;
}
function renderMenuBody(){
  const body=document.getElementById('menuBody');
  if(!body){ renderMenu(); return; }
  const catId=mesaCatActive;
  let html='';
  if(!catId || catId==='all'){
    html += renderSugestoes();
    html += (categorias||[]).map(renderCatSection).join('');
  } else {
    const c=(categorias||[]).find(x=>String(x.id)===String(catId));
    if(c) html += renderCatSection(c);
    else html += (categorias||[]).map(renderCatSection).join('');
  }
  if(!html.trim()) html='<p class="mesa-empty">Nenhum item encontrado.</p>';
  body.innerHTML=html;
}
function renderMenu(){
  const chips=(categorias||[]).length?
    categorias.map(c=>({id:String(c.id),nome:c.nome,ico:CAT_ICONS[c.nome]||'🍽️'}))
    :[];
  const chipHtml=chips.map(ch=>{
    const on=String(mesaCatActive)===String(ch.id);
    return `<button type="button" class="cat-chip${on?' active':''}" role="tab" aria-selected="${on}" onclick="setMesaCat('${esc(ch.id)}')"><span class="chip-ico" aria-hidden="true">${ch.ico}</span><span class="chip-label">${esc(ch.nome)}</span></button>`;
  }).join('');
  const allOn=!mesaCatActive || mesaCatActive==='all';
  const allChip=`<button type="button" class="cat-chip${allOn?' active':''}" role="tab" aria-selected="${allOn}" onclick="setMesaCat('all')"><span class="chip-ico" aria-hidden="true">🍽️</span><span class="chip-label">Tudo</span></button>`;
  const q=mesaSearch.trim();
  const searchHtml=`<div class="mesa-search${q?' has-value':''}" id="mesaSearchBox">
    <span class="search-ico" aria-hidden="true">🔍</span>
    <input id="mesaSearchInput" type="search" placeholder="Buscar no cardápio…" value="${esc(mesaSearch)}" autocomplete="off" enterkeyhint="search">
    <button type="button" class="search-clear" aria-label="Limpar busca" onclick="clearMesaSearch()">×</button>
  </div>`;
  const root=document.getElementById('menuRoot');
  if(!root) return;
  root.innerHTML=`${searchHtml}<div class="cat-chips" role="tablist">${allChip}${chipHtml}</div><div id="menuBody" class="menu-body"></div>`;
  const input=document.getElementById('mesaSearchInput');
  if(input){
    input.addEventListener('input',()=>{
      mesaSearch=input.value||'';
      onMesaSearch(mesaSearch);
    });
    input.addEventListener('search',()=>onMesaSearch(input.value||''));
  }
  renderMenuBody();
}

/* ====== PRODUTO / CARRINHO (lógica mantida) ====== */
function openProduct(id){
  const p=produtos.find(x=>String(x.id)===String(id));
  if(!p) return;
  const escolha=productIsEscolha(p,p._catNome||'');
  const adds=(p.adicionais||[]).map(a=>{
    const preco=Number(a.preco||0);
    const label=preco>0?`${esc(a.nome)} (+${br(preco)})`:esc(a.nome);
    return `<label class="opt-row"><input type="checkbox" data-add-id="${a.id}" data-add-preco="${preco}" data-add-nome="${esc(a.nome)}"><span>${label}</span></label>`;
  }).join('');
  const rems=(p.removiveis||[]).map(r=>`<label class="opt-row"><input type="checkbox" data-rem-id="${r.id||r}" data-rem-nome="${esc(r.nome||r)}"><span>Sem ${esc(r.nome||r)}</span></label>`).join('');
  const customBlock=(adds||rems)?`<div class="custom-block">${adds?`<div class="custom-group"><b>${escolha?'Escolha o sabor / opção':'Adicionais'}</b>${adds}</div>`:''}${rems?`<div class="custom-group"><b>Remover</b>${rems}</div>`:''}</div>`:'';
  const foto=productFoto(p,p._catNome||'');
  document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet product-sheet"><button class="close" type="button" onclick="closeModal()">×</button>
    <div class="product-hero"><img src="${esc(foto)}" alt="" onerror="this.onerror=null;this.src='/assets/demo/burger.webp'"></div>
    <h2>${esc(p.nome)}</h2>
    <p class="desc">${esc(p.descricao||'')}</p>
    <div class="price-lg">${br(p.preco)}</div>
    ${customBlock}
    <div class="qty-row"><button type="button" class="qty-btn" onclick="changeQty(-1)">−</button><span id="qtyVal">1</span><button type="button" class="qty-btn" onclick="changeQty(1)">+</button></div>
    <label class="note-row">Observação <input id="itemNote" type="text" maxlength="120" placeholder="Ex: bem passado, sem cebola…"></label>
    <button type="button" class="btn-primary btn-block" id="addToCartBtn" onclick="addCurrentToCart(${p.id})">Adicionar · ${br(p.preco)}</button>
  </div></div>`;
  window._curQty=1;
  window._curProductId=p.id;
  updateAddBtnPrice();
  document.querySelectorAll('.opt-row input').forEach(inp=>inp.addEventListener('change',updateAddBtnPrice));
}
function changeQty(d){
  window._curQty=Math.max(1,Math.min(20,(window._curQty||1)+d));
  const el=document.getElementById('qtyVal');
  if(el) el.textContent=window._curQty;
  updateAddBtnPrice();
}
function updateAddBtnPrice(){
  const p=produtos.find(x=>String(x.id)===String(window._curProductId));
  if(!p) return;
  let add=0;
  document.querySelectorAll('.opt-row input[data-add-id]:checked').forEach(inp=>{add+=Number(inp.getAttribute('data-add-preco')||0);});
  const total=(Number(p.preco)+add)*(window._curQty||1);
  const btn=document.getElementById('addToCartBtn');
  if(btn) btn.textContent='Adicionar · '+br(total);
}
function addCurrentToCart(productId){
  const p=produtos.find(x=>String(x.id)===String(productId));
  if(!p) return;
  const additions=[];
  document.querySelectorAll('.opt-row input[data-add-id]:checked').forEach(inp=>{
    additions.push({id:inp.getAttribute('data-add-id'),nome:inp.getAttribute('data-add-nome'),preco:Number(inp.getAttribute('data-add-preco')||0)});
  });
  const removals=[];
  document.querySelectorAll('.opt-row input[data-rem-id]:checked').forEach(inp=>{
    removals.push(inp.getAttribute('data-rem-id'));
  });
  const note=(document.getElementById('itemNote')||{}).value||'';
  const qty=window._curQty||1;
  const key=itemKey(productId,additions,removals,note);
  const existing=cart.find(i=>itemKey(i.productId,i.additions,i.removals,i.note)===key);
  if(existing) existing.qty+=qty;
  else cart.push({productId,additions,removals,note,qty});
  updateCartPill();
  closeModal();
  showToast('Adicionado ao carrinho',1800);
}
function openCart(){
  if(!cart.length){showToast('Carrinho vazio',1800);return;}
  const lines=cart.map((i,idx)=>{
    const p=produtos.find(x=>String(x.id)===String(i.productId));
    const nome=p?p.nome:'Item';
    const extras=(i.additions||[]).map(a=>a.nome).concat((i.removals||[]).map(r=>'sem '+r)).join(', ');
    return `<div class="cart-line" data-idx="${idx}">
      <div class="cart-line__main"><b>${i.qty}× ${esc(nome)}</b>${extras?`<div class="muted" style="font-size:.8rem">${esc(extras)}</div>`:''}${i.note?`<div class="muted" style="font-size:.8rem">Obs: ${esc(i.note)}</div>`:''}</div>
      <div class="cart-line__side"><b>${br(itemTotal(i))}</b>
        <div class="cart-qty"><button type="button" onclick="cartQty(${idx},-1)">−</button><span>${i.qty}</span><button type="button" onclick="cartQty(${idx},1)">+</button></div>
        <button type="button" class="btn-ghost" onclick="removeCartLine(${idx})">Remover</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet cart-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>Seu pedido</h2>${lines}<div class="conta-total"><span>Subtotal</span><b>${br(cartTotal())}</b></div><button type="button" class="btn-primary btn-block" onclick="enviarPedido()">Enviar pedido</button></div></div>`;
}
function cartQty(idx,d){
  const i=cart[idx];
  if(!i) return;
  i.qty=Math.max(1,Math.min(20,i.qty+d));
  updateCartPill();
  openCart();
}
function removeCartLine(idx){
  cart.splice(idx,1);
  updateCartPill();
  if(!cart.length) closeModal();
  else openCart();
}
async function enviarPedido(){
  if(!cart.length) return;
  const itens=cart.map(i=>({
    produto_id:i.productId,
    quantidade:i.qty,
    adicionais:(i.additions||[]).map(a=>a.id),
    removidos:i.removals||[],
    observacao:i.note||''
  }));
  try{
    const r=await fetch('/api/mesas/'+token+'/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itens})});
    if(!r.ok){const e=await r.json().catch(()=>({}));showToast(e.error||'Falha ao enviar pedido',3000);return;}
    cart=[];
    updateCartPill();
    closeModal();
    showToast('Pedido enviado!',2200);
    await loadSessao();
  }catch(_){showToast('Erro de rede',2800);}
}

// boot
boot();

// compact scroll helper (visual)
(function mesaScrollCompact(){
  const root=document.documentElement;
  let lastY=0;
  function update(){
    const y=window.scrollY||0;
    if(y>40) root.classList.add('mesa-scrolled');
    else root.classList.remove('mesa-scrolled');
    lastY=y;
    requestAnimationFrame(update);
  }
  update();
})();
