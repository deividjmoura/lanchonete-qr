function openCart(){cartOpen=true;sessaoOpen=false;const total=cartTotal();const editando=window._editandoPedidoId;const lines=cart.length?cart.map(i=>{const p=produtos.find(x=>x.id===i.productId);const extras=[];i.additions.forEach(a=>extras.push('+'+esc(a.nome)));i.removals.forEach(r=>extras.push('sem '+esc(r)));if(i.note)extras.push(esc(i.note));const extraHtml=extras.length?'<span class="cart-line-extra">'+extras.join(' · ')+'</span>':'';return `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(240,235,224,.1)"><div style="min-width:0"><b>${i.qty}× ${esc(p?.nome||'Item')}</b>${extraHtml}<br><small>${br(itemTotal(i))}</small></div><div class="qty-row"><button type="button" onclick="changeQty('${i.key}',-1)">−</button><span>${i.qty}</span><button type="button" onclick="changeQty('${i.key}',1)">+</button></div></div>`;}).join(''):'<div style="text-align:center;padding:28px;color:#a89f8c">Carrinho vazio.</div>';const btnLabel=editando?`Salvar alterações · ${br(total)}`:`Enviar pedido · ${br(total)}`;const titulo=editando?'Editando pedido':'Seu pedido';document.getElementById('modal').innerHTML=`<div class="modal-root" role="dialog" aria-modal="true"><div class="modal-backdrop" onclick="closeModal()"></div><div class="modal-sheet"><button class="close" type="button" onclick="closeModal()">×</button><h2>${titulo}</h2>${editando?'<p class="muted" style="margin:0 0 10px;font-size:.85rem">Ajuste os itens e salve. A cozinha verá o pedido como <b>editado</b>.</p>':''}${lines}${cart.length?`<div class="cart-total-row"><span>Total</span><span>${br(total)}</span></div><button class="btn primary" style="width:100%;margin-top:12px" type="button" id="btnSend" onclick="send()">${btnLabel}</button>${editando?'<button class="btn" style="width:100%;margin-top:8px" type="button" onclick="window._editandoPedidoId=null;cart=[];updateCartPill();openCart()">Descartar edição</button>':''}`:''}</div></div>`;document.body.classList.add('modal-open');}
function changeQty(key,d){const i=cart.find(x=>x.key===key);if(!i)return;i.qty+=d;if(i.qty<=0)cart=cart.filter(x=>x.key!==key);updateCartPill();if(cartOpen)openCart();}
function getPayPref(){try{return sessionStorage.getItem('lq-pay-pref-'+token)||'';}catch(_){return '';}}
function setPayPref(v){try{sessionStorage.setItem('lq-pay-pref-'+token,v);}catch(_){ } window._payPref=v;}
function askPayPref(pedidoInfo){
  const total=pedidoInfo&&pedidoInfo.total!=null?Number(pedidoInfo.total):0;
  const id=pedidoInfo&&pedidoInfo.id?pedidoInfo.id:'';
  document.getElementById('modal').innerHTML=`
    <div class="modal-root" role="dialog" aria-modal="true">
      <div class="modal-backdrop" onclick="closeModal()"></div>
      <div class="modal-sheet">
        <button class="close" type="button" onclick="closeModal()">×</button>
        <h2>Pedido enviado</h2>
        <p style="margin:0 0 8px;color:rgba(245,242,238,.88);line-height:1.45">
          Você quer pagar pelo <b>PIX aqui mesmo</b> ou deseja que o <b>garçom traga maquininha/troco</b>?
        </p>
        <p class="muted" style="font-size:.82rem;margin:0 0 16px">
          O QR Code PIX só aparece na conta quando o pedido estiver <b>entregue</b> (depois do preparo).
          ${total>0?'Valor deste pedido: <b>'+br(total)+'</b>.':''}
        </p>
        <button type="button" class="btn primary" style="width:100%;margin-bottom:10px" id="payPrefPix">Pagar com PIX no celular</button>
        <button type="button" class="btn" style="width:100%" id="payPrefGarcom">Garçom trazer maquininha / troco</button>
      </div>
    </div>`;
  document.body.classList.add('modal-open');
  cartOpen=false;sessaoOpen=false;
  const pixBtn=document.getElementById('payPrefPix');
  const gBtn=document.getElementById('payPrefGarcom');
  if(pixBtn)pixBtn.onclick=function(){
    setPayPref('pix');
    closeModal();
    showToast('PIX escolhido — o código aparece quando o pedido for entregue', 3600);
  };
  if(gBtn)gBtn.onclick=function(){
    setPayPref('garcom');
    closeModal();
    showToast('Combinado — o garçom leva a maquininha/troco', 3200);
  };
}
async function send(){await ensureClienteNome();if(!cart.length)return;const btn=document.getElementById('btnSend');if(btn){btn.disabled=true;btn.textContent='Enviando…';}const items=cart.map(i=>({productId:i.productId,qty:i.qty,additions:i.additions.map(a=>({id:a.id})),removals:i.removals,note:i.note}));const editId=window._editandoPedidoId;try{
  let r,o;
  if(editId){
    r=await fetch(apiMesa('/pedidos/'+editId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,note:''})});
    o=await r.json();
    if(!r.ok){alert(o.error||'Não foi possível salvar a edição');if(btn){btn.disabled=false;btn.textContent='Salvar alterações';}return;}
    window._editandoPedidoId=null;cart=[];updateCartPill();await loadSessao();
    showToast('Pedido atualizado · '+br(o.total),2800);
    askPayPref({id:editId,total:o.total});
  }else{
    r=await fetch(apiMesa('/pedidos'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clienteNome:getClienteNome(),items,note:''})});
    o=await r.json();
    if(!r.ok){alert(o.error||'Não foi possível enviar');if(btn){btn.disabled=false;btn.textContent='Enviar pedido';}return;}
    cart=[];updateCartPill();await loadSessao();
    showToast('Pedido enviado · '+br(o.total),2400);
    askPayPref({id:o.id,total:o.total});
  }
}catch(e){alert('Falha de rede');if(btn){btn.disabled=false;}}
}
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeModal();});
ensureClienteNome().then(()=>{loadSessao();loadCardapio();});
if(window.LQRRealtime){LQRRealtime.connect(()=>loadSessao(),{fallbackMs:25000,debounceMs:200});}else{setInterval(loadSessao,8000);}
