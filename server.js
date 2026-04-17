const express = require('express');
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const FONT_PORT = 8765;

// ─── Servidor local de fontes (evita data URL — incompatível com Chromium antigo) ─
const FONT_FILES = {
  'bc-900.woff2':     '@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2',
  'bc-900x.woff2':    '@fontsource/barlow-condensed/files/barlow-condensed-latin-ext-900-normal.woff2',
  'b-400.woff2':      '@fontsource/barlow/files/barlow-latin-400-normal.woff2',
  'b-400x.woff2':     '@fontsource/barlow/files/barlow-latin-ext-400-normal.woff2',
  'b-700.woff2':      '@fontsource/barlow/files/barlow-latin-700-normal.woff2',
  'b-700x.woff2':     '@fontsource/barlow/files/barlow-latin-ext-700-normal.woff2',
};

const fontServer = http.createServer((req, res) => {
  const key = req.url.slice(1);
  const pkg = FONT_FILES[key];
  if (!pkg) { res.writeHead(404); return res.end(); }
  try {
    const buf = fs.readFileSync(require.resolve(pkg));
    res.setHeader('Content-Type', 'font/woff2');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(buf);
  } catch {
    res.writeHead(404); res.end();
  }
});

fontServer.listen(FONT_PORT, '127.0.0.1', () => {
  console.log(`Font server rodando em http://127.0.0.1:${FONT_PORT}`);
});

const BASE = `http://127.0.0.1:${FONT_PORT}`;

const FONT_CSS = `
@font-face {
  font-family: 'Barlow Condensed'; font-weight: 900; font-style: normal; font-display: block;
  src: url('${BASE}/bc-900x.woff2') format('woff2');
  unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Barlow Condensed'; font-weight: 900; font-style: normal; font-display: block;
  src: url('${BASE}/bc-900.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Barlow'; font-weight: 400; font-style: normal; font-display: block;
  src: url('${BASE}/b-400x.woff2') format('woff2');
  unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Barlow'; font-weight: 400; font-style: normal; font-display: block;
  src: url('${BASE}/b-400.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Barlow'; font-weight: 700; font-style: normal; font-display: block;
  src: url('${BASE}/b-700x.woff2') format('woff2');
  unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Barlow'; font-weight: 700; font-style: normal; font-display: block;
  src: url('${BASE}/b-700.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`;

// ─── Template HTML do banner ──────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.text({ type: ['text/plain', 'text/*', '*/*'], limit: '2mb' }));

function buildHtml(data) {
  const { titulo_linha1, titulo_linha2, mostrar_selo, campos } = data;

  const camposHtml = campos.map(c => `
    <div class="field-row">
      <div class="field-label">${c.label}</div>
      <div class="field-value">${c.valor.replace(/\n/g, '<br>')}</div>
    </div>
  `).join('');

  const titleSize = (titulo_linha1.length > 14 || titulo_linha2.length > 14) ? '72px' : '88px';
  const fieldsTop = campos.length >= 4 ? '500px' : '530px';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
${FONT_CSS}
* { margin:0; padding:0; box-sizing:border-box; }
body { width:940px; height:1200px; overflow:hidden; background:#1e1e1e; }
.card { width:940px; height:1200px; background:linear-gradient(145deg, #242824 0%, #181c18 60%, #111411 100%); position:relative; overflow:hidden; }

/* Decorações */
.glow { position:absolute; width:700px; height:700px; border-radius:50%; background:radial-gradient(circle, rgba(61,190,60,0.07) 0%, transparent 65%); top:-200px; right:-200px; pointer-events:none; }
.side-bar { position:absolute; top:0; left:0; width:7px; height:100%; background:linear-gradient(180deg, #4ccc3c 0%, #1a8c28 55%, rgba(26,140,40,0) 100%); }
.bottom-bar { position:absolute; bottom:0; left:0; right:0; height:4px; background:linear-gradient(90deg, transparent, #3dbe4a 30%, #1a8c28 70%, transparent); }
.corner-deco { position:absolute; bottom:60px; right:0; width:320px; height:320px; opacity:0.04; }

/* Header */
.header { position:absolute; top:44px; left:52px; right:52px; display:flex; align-items:center; justify-content:space-between; }
.logo-svg { width:180px; }
.tag { background:linear-gradient(135deg, #3dbe4a, #1a7c28); color:#fff; font-family:'Barlow',sans-serif; font-weight:700; font-size:13px; padding:8px 22px; border-radius:100px; letter-spacing:2.5px; text-transform:uppercase; }

/* Divisor */
.divider { position:absolute; top:148px; left:52px; right:52px; height:1px; background:linear-gradient(90deg, rgba(61,190,74,0.5), rgba(61,190,74,0.1) 60%, transparent); }

/* Título */
.title { position:absolute; top:175px; left:52px; right:52px; }
.title-l1 { font-family:'Barlow',sans-serif; font-weight:300; font-size:${titleSize}; color:rgba(255,255,255,0.75); line-height:1; letter-spacing:-1px; text-transform:uppercase; }
.title-l2 { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:${titleSize}; color:#ffffff; line-height:0.95; letter-spacing:-2px; text-transform:uppercase; margin-top:4px; }
.title-accent { width:64px; height:5px; background:linear-gradient(90deg, #4ccc3c, #1a8c28); border-radius:10px; margin-top:22px; }

/* Campos */
.fields { position:absolute; top:${fieldsTop}; left:52px; right:52px; display:flex; flex-direction:column; gap:22px; }
.field-row { display:flex; align-items:center; gap:28px; }
.field-label { font-family:'Barlow',sans-serif; font-weight:700; font-size:13px; color:rgba(255,255,255,0.35); letter-spacing:3px; text-transform:uppercase; min-width:188px; flex-shrink:0; }
.field-value { flex:1; background:linear-gradient(135deg, rgba(61,190,74,0.12), rgba(26,140,40,0.08)); border:1px solid rgba(61,190,74,0.25); border-radius:14px; padding:15px 28px; font-family:'Barlow',sans-serif; font-weight:700; font-size:26px; color:#fff; text-align:center; line-height:1.3; }

/* Selo */
.stamp { position:absolute; top:290px; right:52px; width:140px; height:140px; ${mostrar_selo ? '' : 'display:none;'} }

/* Footer */
.footer { position:absolute; bottom:22px; left:52px; right:52px; display:flex; align-items:center; justify-content:space-between; }
.footer-url { font-family:'Barlow',sans-serif; font-weight:400; font-size:16px; color:rgba(255,255,255,0.2); letter-spacing:3px; text-transform:uppercase; }
</style>
</head>
<body>
<div class="card">
  <div class="glow"></div>
  <div class="side-bar"></div>
  <div class="bottom-bar"></div>

  <!-- Decoração canto -->
  <svg class="corner-deco" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="320" cy="320" r="280" stroke="white" stroke-width="2"/>
    <circle cx="320" cy="320" r="200" stroke="white" stroke-width="1.5"/>
    <circle cx="320" cy="320" r="120" stroke="white" stroke-width="1"/>
  </svg>

  <!-- Header -->
  <div class="header">
    <!-- Logo CheckNegócios SVG -->
    <svg class="logo-svg" viewBox="0 0 320 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Ícone M + check -->
      <g transform="translate(0, 4)">
        <polygon points="6,66 22,14 40,46 58,14 74,66 64,66 58,36 40,62 22,36 16,66" fill="white"/>
        <polyline points="20,38 34,56 66,16" fill="none" stroke="url(#g1)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <defs>
        <linearGradient id="g1" x1="20" y1="38" x2="66" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#7dde4a"/>
          <stop offset="100%" stop-color="#2a9e30"/>
        </linearGradient>
      </defs>
      <!-- check texto -->
      <text x="90" y="62" font-family="'Barlow',sans-serif" font-weight="800" font-size="52" fill="white" letter-spacing="-1">check</text>
      <!-- negócios texto -->
      <text x="90" y="76" font-family="'Barlow',sans-serif" font-weight="600" font-size="18" fill="url(#g2)" letter-spacing="1">negócios</text>
      <defs>
        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#7dde4a"/>
          <stop offset="100%" stop-color="#2a9e30"/>
        </linearGradient>
      </defs>
    </svg>

    <div class="tag">Comunicado</div>
  </div>

  <div class="divider"></div>

  <!-- Título -->
  <div class="title">
    <div class="title-l1">${titulo_linha1}</div>
    <div class="title-l2">${titulo_linha2}</div>
    <div class="title-accent"></div>
  </div>

  <!-- Selo -->
  <div class="stamp">
    <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="70" cy="70" r="64" stroke="#4ccc3c" stroke-width="2" stroke-dasharray="5 3" opacity="0.6"/>
      <circle cx="70" cy="70" r="52" stroke="#4ccc3c" stroke-width="1.5" opacity="0.4"/>
      <rect x="10" y="53" width="120" height="34" rx="6" fill="#4ccc3c" opacity="0.1"/>
      <rect x="10" y="53" width="120" height="34" rx="6" fill="none" stroke="#4ccc3c" stroke-width="1.5" opacity="0.5"/>
      <text x="70" y="76" font-family="Arial" font-weight="bold" font-size="11" fill="#4ccc3c" text-anchor="middle" opacity="0.8" letter-spacing="2">NOVO CONVÊNIO</text>
    </svg>
  </div>

  <!-- Campos -->
  <div class="fields">${camposHtml}</div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-url">checknegocios.com.br</div>
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.25">
      <polygon points="3,34 11,8 20,24 29,8 37,34 32,34 29,18 20,32 11,18 8,34" fill="white"/>
      <polyline points="10,20 17,30 32,10" fill="none" stroke="#4ccc3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
</div>
</body>
</html>`;
}

// ─── Rota principal ───────────────────────────────────────────────────────────
app.post('/render', async (req, res) => {
  try {
    let data = req.body;

    // Se recebeu como string (Content-Type errado ou raw text), faz parse manual
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        return res.status(400).json({ error: `JSON inválido: ${e.message}` });
      }
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Payload vazio' });
    }

    if (!data.titulo_linha1 || !data.titulo_linha2 || !Array.isArray(data.campos)) {
      return res.status(400).json({ error: 'Payload inválido. Necessário: titulo_linha1, titulo_linha2, campos[]' });
    }

    const html = buildHtml(data);

    const browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 940, height: 1200 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();

    const base64 = screenshot.toString('base64');
    res.json({ image: base64 });

  } catch (err) {
    console.error('Erro ao renderizar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Banner renderer rodando na porta ${PORT}`));
