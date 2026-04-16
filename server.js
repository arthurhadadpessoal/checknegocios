const express = require('express');
const puppeteer = require('puppeteer-core');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const app = express();
app.use(express.json({ limit: '2mb' }));

// ─── Pré-carrega CSS do Google Fonts com UA moderno ───────────────────────────
// Isso garante que todos os glyphs portugueses (ã, ê, ç, ó, etc.) sejam incluídos
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@900&family=Barlow:wght@400;700&display=swap';
const MODERN_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let fontCss = ''; // preenchido no startup

async function preloadFonts() {
  try {
    const res = await fetch(FONTS_URL, { headers: { 'User-Agent': MODERN_UA } });
    fontCss = await res.text();
    console.log(`Fontes pré-carregadas (${fontCss.length} chars)`);
  } catch (e) {
    console.warn('Falha ao pré-carregar fontes:', e.message);
  }
}

// ─── Template HTML do banner ──────────────────────────────────────────────────
function buildHtml(data) {
  const { titulo_linha1, titulo_linha2, mostrar_selo, campos } = data;

  const camposHtml = campos.map(c => `
    <div class="field-row">
      <div class="field-label">${c.label}</div>
      <div class="field-value">${c.valor.replace(/\n/g, '<br>')}</div>
    </div>
  `).join('');

  const extraStyle = campos.length >= 4
    ? `.fields { top: 440px !important; } .title { font-size: 96px !important; }`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
${fontCss}
* { margin:0; padding:0; box-sizing:border-box; }
body { width:940px; height:1200px; overflow:hidden; background:#e5e3de; }
.card { width:940px; height:1200px; background:#e5e3de; position:relative; overflow:hidden; }
.tri1 { position:absolute; bottom:0; left:0; width:0; height:0; border-style:solid; border-width:0 0 360px 460px; border-color:transparent transparent #1b5e2a transparent; }
.tri2 { position:absolute; bottom:0; left:55px; width:0; height:0; border-style:solid; border-width:0 0 300px 380px; border-color:transparent transparent #2e8c44 transparent; }
.tri3 { position:absolute; bottom:0; left:0; width:0; height:0; border-style:solid; border-width:0 0 70px 200px; border-color:transparent transparent #111 transparent; }
.logo { position:absolute; top:38px; right:48px; }
.title { position:absolute; top:48px; left:52px; font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:108px; line-height:0.9; color:#1a1a1a; text-transform:uppercase; letter-spacing:-2px; }
.stamp { position:absolute; top:300px; right:52px; width:158px; height:158px; ${mostrar_selo ? '' : 'display:none;'} }
.fields { position:absolute; top:490px; left:52px; right:52px; display:flex; flex-direction:column; gap:40px; }
.field-row { display:flex; align-items:flex-start; gap:40px; }
.field-label { font-family:'Barlow',sans-serif; font-weight:700; font-size:34px; color:#1a1a1a; min-width:210px; padding-top:14px; flex-shrink:0; }
.field-value { font-family:'Barlow',sans-serif; font-weight:700; font-size:28px; color:#fff; background:#2e8c44; border-radius:50px; padding:14px 34px; flex:1; text-align:center; line-height:1.25; }
.site { position:absolute; bottom:130px; left:0; right:0; text-align:center; font-family:'Barlow',sans-serif; font-weight:700; font-size:22px; color:#444; letter-spacing:1px; }
${extraStyle}
</style>
</head>
<body>
<div class="card">
  <div class="tri1"></div>
  <div class="tri2"></div>
  <div class="tri3"></div>
  <div class="logo">
    <svg width="76" height="60" viewBox="0 0 76 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="4,52 20,8 38,36 56,8 72,52 62,52 56,28 38,52 20,28 14,52" fill="#1a1a1a"/>
      <polyline points="18,30 30,44 58,12" fill="none" stroke="#2e8c44" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <div class="title">
    <div>${titulo_linha1}</div>
    <div>${titulo_linha2}</div>
  </div>
  <div class="stamp">
    <svg viewBox="0 0 158 158" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="79" cy="79" r="72" stroke="#1a3a8c" stroke-width="3" stroke-dasharray="6 3" opacity="0.7"/>
      <circle cx="79" cy="79" r="60" stroke="#1a3a8c" stroke-width="2" opacity="0.5"/>
      <rect x="14" y="62" width="130" height="34" rx="6" fill="#1a3a8c" opacity="0.15"/>
      <rect x="14" y="62" width="130" height="34" rx="6" fill="none" stroke="#1a3a8c" stroke-width="2" opacity="0.6"/>
      <text x="79" y="85" font-family="Arial" font-weight="bold" font-size="13" fill="#1a3a8c" text-anchor="middle" opacity="0.85" letter-spacing="2">NOVO CONVÊNIO</text>
    </svg>
  </div>
  <div class="fields">${camposHtml}</div>
  <div class="site">checknegocios.com.br</div>
</div>
</body>
</html>`;
}

// ─── Rota principal ───────────────────────────────────────────────────────────
app.post('/render', async (req, res) => {
  try {
    const data = req.body;

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

    res.set('Content-Type', 'image/png');
    res.send(screenshot);

  } catch (err) {
    console.error('Erro ao renderizar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

preloadFonts().then(() => {
  app.listen(PORT, () => console.log(`Banner renderer rodando na porta ${PORT}`));
});
