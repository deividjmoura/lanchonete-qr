/**
 * Consentimento de cookies + preferências de UI no localStorage.
 * Não envia dados ao servidor — só memoriza no navegador.
 */
(function () {
  var KEY = 'lq-cookie-ok';

  function accepted() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function accept() {
    try {
      localStorage.setItem(KEY, '1');
    } catch (_) {}
    var el = document.getElementById('lqCookieBanner');
    if (el) el.remove();
  }

  function decline() {
    try {
      localStorage.setItem(KEY, '0');
    } catch (_) {}
    var el = document.getElementById('lqCookieBanner');
    if (el) el.remove();
  }

  function showBanner() {
    if (accepted() || localStorage.getItem(KEY) === '0') return;
    if (document.getElementById('lqCookieBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'lqCookieBanner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Aviso de cookies');
    bar.innerHTML =
      '<div class="lq-cookie-inner">' +
      '<p>Nosso site usa <b>cookies</b> e armazenamento local só para lembrar preferências neste aparelho ' +
      '(categoria aberta, pedidos expandidos na conta). Não usamos para rastrear anúncios.</p>' +
      '<div class="lq-cookie-actions">' +
      '<button type="button" class="lq-cookie-ok">Aceitar</button>' +
      '<button type="button" class="lq-cookie-no">Agora não</button>' +
      '</div></div>';
    document.body.appendChild(bar);
    bar.querySelector('.lq-cookie-ok').addEventListener('click', accept);
    bar.querySelector('.lq-cookie-no').addEventListener('click', decline);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
  window.LQRCookies = { accepted: accepted, accept: accept, decline: decline };
})();
