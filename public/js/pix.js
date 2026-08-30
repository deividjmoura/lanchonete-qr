// PIX estático (copia-e-cola / QR). Config via GET /api/config/pix
(function (global) {
  function tlv(id, value) {
    const v = String(value);
    return id + String(v.length).padStart(2, '0') + v;
  }

  function crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  const LQRPix = {
    config: { chave: '', nome: 'LANCHONETE', cidade: 'BRASIL' },

    async loadConfig() {
      try {
        const r = await fetch('/api/config/pix');
        if (r.ok) {
          const d = await r.json();
          this.config = {
            chave: String(d.chave || '').trim(),
            nome: String(d.nome || 'LANCHONETE').trim().slice(0, 25) || 'LANCHONETE',
            cidade: String(d.cidade || 'BRASIL').trim().slice(0, 15) || 'BRASIL',
          };
        }
      } catch (_) { /* keep defaults */ }
      return this.config;
    },

    disponivel() {
      return Boolean(this.config.chave);
    },

    montarPayload(valor) {
      if (!this.config.chave) return '';
      const amount = Number(valor || 0).toFixed(2);
      const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', this.config.chave);
      let payload =
        tlv('00', '01') +
        tlv('26', mai) +
        tlv('52', '0000') +
        tlv('53', '986') +
        tlv('54', amount) +
        tlv('58', 'BR') +
        tlv('59', this.config.nome) +
        tlv('60', this.config.cidade) +
        tlv('62', tlv('05', '***'));
      payload += '6304' + crc16(payload);
      return payload;
    },

    qrUrl(valor) {
      const payload = this.montarPayload(valor);
      if (!payload) return '';
      return (
        'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
        encodeURIComponent(payload)
      );
    },
  };

  global.LQRPix = LQRPix;
})(typeof window !== 'undefined' ? window : globalThis);
