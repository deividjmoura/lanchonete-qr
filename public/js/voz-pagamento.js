/**
 * voz-pagamento.js
 * Anuncia por voz (Web Speech API) quando uma mesa informa pagamento via pix.
 * Sem custo, sem API key — usa o TTS nativo do navegador.
 *
 * Uso: window.anunciarPagamento({ mesa: 2, forma: 'pix' })
 */
(function (global) {
  const CONFIG = {
    ativo: true,
    modo: 'engracado', // 'formal' | 'engracado' | 'aleatorio'
    volume: 1,
    pitch: 1.05,
    rate: 1.0,
    idioma: 'pt-BR',
  };

  const FRASES_FORMAIS = [
    (mesa, forma) => `A conta da mesa ${mesa} foi paga via ${forma}.`,
    (mesa, forma) => `Pagamento confirmado. Mesa ${mesa}, ${forma}.`,
    (mesa, forma) => `Mesa ${mesa} quitada. Forma de pagamento: ${forma}.`,
  ];

  const FRASES_ENGRACADAS = [
    (mesa, forma) => `Ihaaa! A mesa ${mesa} já pagou no ${forma}!`,
    (mesa, forma) => `Dinheiro na conta! Mesa ${mesa} mandou o ${forma}!`,
    (mesa, forma) => `Alerta de sucesso: mesa ${mesa} pagou no ${forma}, bora liberar!`,
    (mesa, forma) => `Isso aí! Mesa ${mesa} acabou de pagar via ${forma}!`,
    (mesa, forma) => `Show de bola, mesa ${mesa} quitou no ${forma}!`,
  ];

  const fila = [];
  let falando = false;
  let vozesCache = null;

  function escolherVoz() {
    if (!vozesCache || vozesCache.length === 0) {
      vozesCache = global.speechSynthesis.getVoices();
    }
    if (!vozesCache || vozesCache.length === 0) return null;
    return (
      vozesCache.find((v) => v.lang === 'pt-BR') ||
      vozesCache.find((v) => v.lang && v.lang.startsWith('pt')) ||
      null
    );
  }

  if ('speechSynthesis' in global) {
    global.speechSynthesis.onvoiceschanged = () => {
      vozesCache = global.speechSynthesis.getVoices();
    };
  }

  function processarFila() {
    if (falando || fila.length === 0) return;
    falando = true;
    const texto = fila.shift();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = CONFIG.idioma;
    utter.volume = CONFIG.volume;
    utter.pitch = CONFIG.pitch;
    utter.rate = CONFIG.rate;
    const voz = escolherVoz();
    if (voz) utter.voice = voz;
    utter.onend = utter.onerror = () => {
      falando = false;
      processarFila();
    };
    global.speechSynthesis.speak(utter);
  }

  function anunciarPagamento(opts) {
    opts = opts || {};
    const mesa = opts.mesa;
    const forma = opts.forma || 'pix';
    const modo = opts.modo;

    if (!CONFIG.ativo) return;
    if (!('speechSynthesis' in global)) {
      console.warn('[voz-pagamento] Web Speech API não suportada neste navegador.');
      return;
    }
    if (mesa === undefined || mesa === null) {
      console.warn('[voz-pagamento] número da mesa não informado.');
      return;
    }

    const modoEfetivo = modo || CONFIG.modo;
    const banco =
      modoEfetivo === 'formal'
        ? FRASES_FORMAIS
        : modoEfetivo === 'engracado'
        ? FRASES_ENGRACADAS
        : Math.random() < 0.5
        ? FRASES_FORMAIS
        : FRASES_ENGRACADAS;

    const gerador = banco[Math.floor(Math.random() * banco.length)];
    fila.push(gerador(mesa, forma));
    processarFila();
  }

  function definirAtivo(ativo) {
    CONFIG.ativo = !!ativo;
    if (!ativo) {
      global.speechSynthesis.cancel();
      fila.length = 0;
      falando = false;
    }
  }

  function definirModo(modo) {
    CONFIG.modo = modo;
  }

  global.anunciarPagamento = anunciarPagamento;
  global.vozPagamentoConfig = CONFIG;
  global.vozPagamentoDefinirAtivo = definirAtivo;
  global.vozPagamentoDefinirModo = definirModo;
})(window);
