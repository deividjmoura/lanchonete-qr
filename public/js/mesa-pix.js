// PIX na conta da mesa — por pedido (dentro do card) + total da conta (fora)
(function () {
  function whenReady(fn) {
    if (typeof openSessao === 'function' && window.LQRPix) return fn();
    setTimeout(function () { whenReady(fn); }, 40);
  }

  function pixBoxHtml(valor, opts) {
    opts = opts || {};
    const title = opts.title || 'Pagar este pedido no PIX';
    const payload = LQRPix.montarPayload(valor);
    if (!payload) {
      return (
        '<div class="pix-box">' +
        '<div class="pix-box__title">' + title + '</div>' +
        '<p class="muted" style="font-size:.82rem;margin:0">PIX ainda não configurado. Pague no caixa.</p>' +
        '</div>'
      );
    }
    const qr = LQRPix.qrUrl(valor);
    const brl = 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
    return (
      '<div class="pix-box">' +
      '<div class="pix-box__title">' + title + ' · <b>' + brl + '</b></div>' +
      '<div class="pix-box__row">' +
      '<img class="pix-box__qr" src="' + qr + '" alt="QR PIX" width="120" height="120" loading="lazy">' +
      '<div class="pix-box__copy">' +
      '<button type="button" class="btn pix-copy-btn">Copiar código PIX</button>' +
      '<p class="muted" style="font-size:.75rem;margin:8px 0 0">Cole no app do banco</p>' +
      '</div></div>' +
      '<input type="hidden" class="pix-payload" value="">' +
      '</div>'
    );
  }

  function wireCopy(root, valor) {
    if (!root || !window.LQRPix) return;
    const payload = LQRPix.montarPayload(valor);
    const hidden = root.querySelector('.pix-payload');
    if (hidden) hidden.value = payload;
    const btn = root.querySelector('.pix-copy-btn');
    if (btn && payload) {
      btn.addEventListener('click', function () {
        const t = payload;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(function () {
            btn.textContent = 'Copiado!';
            setTimeout(function () { btn.textContent = 'Copiar código PIX'; }, 1600);
          }).catch(function () {
            prompt('Copie o código PIX:', t);
          });
        } else {
          prompt('Copie o código PIX:', t);
        }
      });
    }
  }

  function injectPix(s) {
    s = s || window.sessaoData || {};
    if (!window.LQRPix) return;

    // PIX por pedido (valor do pedido)
    document.querySelectorAll('.pix-pedido').forEach(function (el) {
      if (el.getAttribute('data-pix-ready')) return;
      const valor = Number(el.getAttribute('data-valor') || 0);
      if (!(valor > 0.009)) {
        el.innerHTML = '';
        el.setAttribute('data-pix-ready', '1');
        return;
      }
      el.innerHTML = pixBoxHtml(valor, { title: 'PIX deste pedido' });
      el.setAttribute('data-pix-ready', '1');
      wireCopy(el, valor);
    });

    // PIX total da conta (fora dos cards)
    const totalEl = document.querySelector('.pix-mesa-total');
    if (totalEl && !totalEl.getAttribute('data-pix-ready')) {
      const pago = Number(s.valorPago || 0);
      const rest =
        s.valorRestante != null
          ? Number(s.valorRestante)
          : Math.max(0, Number(s.totalDevido || 0) - pago);
      if (rest > 0.009 && LQRPix.disponivel()) {
        totalEl.innerHTML =
          pixBoxHtml(rest, { title: 'PIX do total da conta' }) +
          '<p class="muted pix-mesa-hint" style="font-size:.82rem;margin:10px 0 8px">Após pagar, avise o caixa.</p>' +
          '<button type="button" class="btn primary" id="pixJaPagueiBtn">' +
          (s.pixInformadoEm
            ? 'Já paguei no PIX · avisar de novo'
            : 'Já paguei no PIX · avisar o caixa') +
          '</button>';
        wireCopy(totalEl, rest);
        const pagoBtn = totalEl.querySelector('#pixJaPagueiBtn');
        if (pagoBtn) {
          const jaAvisou = !!s.pixInformadoEm;
          pagoBtn.addEventListener('click', async function () {
            pagoBtn.disabled = true;
            pagoBtn.textContent = 'Avisando…';
            try {
              const token = location.pathname.split('/').filter(Boolean).pop();
              const r = await fetch('/api/mesas/' + token + '/pix-informado', { method: 'POST' });
              const d = await r.json().catch(function () { return {}; });
              if (!r.ok) {
                alert(d.error || 'Não foi possível avisar');
                pagoBtn.disabled = false;
                pagoBtn.textContent = jaAvisou
                  ? 'Já paguei no PIX · avisar de novo'
                  : 'Já paguei no PIX · avisar o caixa';
                return;
              }
              if (window.sessaoData) {
                window.sessaoData.pixInformadoEm = d.pixInformadoEm || new Date().toISOString();
                if (d.valorPago != null) window.sessaoData.valorPago = Number(d.valorPago);
                if (d.valorRestante != null) window.sessaoData.valorRestante = Number(d.valorRestante);
                if (d.valorTotal != null) window.sessaoData.totalDevido = Number(d.valorTotal);
              }
              if (typeof showToast === 'function') showToast('Caixa avisado · obrigado!', 2800);
              if (typeof loadSessao === 'function') await loadSessao();
            } catch (e) {
              alert('Falha de rede');
              pagoBtn.disabled = false;
              pagoBtn.textContent = jaAvisou
                ? 'Já paguei no PIX · avisar de novo'
                : 'Já paguei no PIX · avisar o caixa';
            }
          });
        }
      } else if (!LQRPix.disponivel()) {
        totalEl.innerHTML =
          '<div class="pix-box"><div class="pix-box__title">Pagamento</div>' +
          '<p class="muted" style="font-size:.85rem;margin:0">PIX ainda não configurado neste servidor. Pague no caixa.</p></div>';
      }
      totalEl.setAttribute('data-pix-ready', '1');
    }
  }

  whenReady(function () {
    LQRPix.loadConfig().then(function () {
      window._afterOpenSessao = function (s) {
        injectPix(s);
      };
      // se já havia override antigo, não precisa
      const _open = openSessao;
      window.openSessao = function () {
        _open.apply(this, arguments);
        // _afterOpenSessao já é chamado no final de openSessao
      };
    });
  });
})();
