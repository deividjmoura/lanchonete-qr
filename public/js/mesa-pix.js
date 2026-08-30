// PIX na conta da mesa — sobrescreve openSessao após o script principal
(function () {
  function waitReady(fn) {
    if (typeof openSessao === 'function' && window.LQRPix) return fn();
    setTimeout(() => waitReady(fn), 30);
  }

  waitReady(async () => {
    try {
      await LQRPix.loadConfig();
    } catch (_) {}

    const _open = openSessao;
    window.openSessao = function openSessaoPix() {
      _open();
      const s = window.sessaoData || { totalDevido: 0 };
      const total = Number(s.totalDevido || 0);
      if (!(total > 0 && LQRPix.disponivel())) return;

      const sheet = document.querySelector('.modal-sheet');
      if (!sheet || sheet.querySelector('.pix-mesa')) return;

      const payload = LQRPix.montarPayload(total);
      const qr = LQRPix.qrUrl(total);
      const br = (n) =>
        'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

      const div = document.createElement('div');
      div.className = 'pix-mesa';
      div.style.cssText =
        'margin-top:16px;padding:14px;border:1px dashed rgba(240,235,224,.25);border-radius:12px;text-align:center';
      div.innerHTML =
        '<div style="font-weight:700;margin-bottom:6px">Pagar com PIX</div>' +
        '<p class="muted" style="font-size:.85rem;margin:0 0 10px">Valor da conta · ' +
        br(total) +
        '. Após pagar, mostre o comprovante no caixa.</p>' +
        '<img src="' +
        qr +
        '" alt="QR PIX" width="200" height="200" style="border-radius:12px;background:#fff;padding:8px" loading="lazy">' +
        '<button class="btn primary" type="button" style="width:100%;margin-top:12px" id="btnCopiarPixMesa">Copiar código PIX</button>';
      sheet.appendChild(div);

      const btn = document.getElementById('btnCopiarPixMesa');
      if (btn) {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(payload).then(
            () => {
              if (typeof showToast === 'function') showToast('Código PIX copiado', 2200);
              else alert('Código PIX copiado');
            },
            () => alert('Não foi possível copiar')
          );
        });
      }
    };
  });
})();
