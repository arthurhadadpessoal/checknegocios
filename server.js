const express = require('express');
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { OpenAI } = require('openai');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const FONT_PORT = 8765;

// ─── Servidor local de fontes ─────────────────────────────────────────────────
const FONT_FILES = {
  'bc-900.woff2':  '@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2',
  'bc-900x.woff2': '@fontsource/barlow-condensed/files/barlow-condensed-latin-ext-900-normal.woff2',
  'b-400.woff2':   '@fontsource/barlow/files/barlow-latin-400-normal.woff2',
  'b-400x.woff2':  '@fontsource/barlow/files/barlow-latin-ext-400-normal.woff2',
  'b-700.woff2':   '@fontsource/barlow/files/barlow-latin-700-normal.woff2',
  'b-700x.woff2':  '@fontsource/barlow/files/barlow-latin-ext-700-normal.woff2',
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

// ─── Setup ────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ type: ['text/plain', 'text/*', '*/*'], limit: '20mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Carrega e redimensiona a logo real (logo-cn.png) ────────────────────────
const LOGO_PATH = path.join(__dirname, 'logo-cn.png');

async function getLogoBuf(targetW) {
  if (!fs.existsSync(LOGO_PATH)) {
    throw new Error('logo-cn.png não encontrada — coloque o arquivo na pasta banner-renderer/');
  }
  return sharp(LOGO_PATH)
    .resize({ width: targetW, withoutEnlargement: false })
    .png()
    .toBuffer();
}

// ─── GPT-4o Vision: decide estratégia de posicionamento do logo ──────────────
// Estratégia "place": posiciona nas coordenadas x%/y% de espaço vazio
// Estratégia "footer": imagem muito cheia → adiciona faixa de rodapé escura
async function findLogoPlacement(base64, mimeType, imgW, imgH) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `This is a marketing image (${imgW}x${imgH}px). I need to add a "CheckNegócios" brand logo to it.

The logo rectangle is: ${Math.round(imgW * 0.30)}px wide × ${Math.round(imgW * 0.30 / 2.8)}px tall.

DEFAULT STRATEGY IS "footer" — only override to "place" if ALL conditions below are met:
1. There is a region with ZERO text, ZERO faces, ZERO important graphic elements
2. The region is clearly larger than the logo dimensions above
3. You are 100% confident the logo will NOT touch any text or meaningful content

If there is any doubt → use "footer".

STRATEGY A — "place": place the logo at exact pixel coordinates within the image.
STRATEGY B — "footer": we will add a dark strip below the image (safe, never covers content).

Reply with ONLY valid JSON, no markdown:
If A: {"strategy": "place", "x_pct": 5, "y_pct": 85, "reason": "..."}
If B: {"strategy": "footer", "reason": "..."}

x_pct: 0–70, y_pct: 0–88`,
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}`, detail: 'high' },
        },
      ],
    }],
  });

  try {
    const text = resp.choices[0].message.content.trim();
    const json = JSON.parse(text.replace(/```json|```/g, '').trim());
    console.log(`[Overlay] estratégia=${json.strategy} — ${json.reason}`);
    if (json.strategy === 'place') {
      return {
        strategy: 'place',
        x_pct: Math.min(Math.max(Number(json.x_pct) || 4, 0), 70),
        y_pct: Math.min(Math.max(Number(json.y_pct) || 85, 0), 88),
      };
    }
    return { strategy: 'footer' };
  } catch (e) {
    console.warn('[Overlay] Falha ao parsear resposta da IA:', e.message, '— usando footer');
    return { strategy: 'footer' };
  }
}

// ─── HTML da interface web ────────────────────────────────────────────────────
const UI_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CheckNegócios — Marketing Studio</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0f0d;
    --surface: #131613;
    --surface2: #1a1e1a;
    --border: #242824;
    --green: #4ccc3c;
    --green2: #1a8c28;
    --green-dim: rgba(76,204,60,0.12);
    --white: #ffffff;
    --muted: rgba(255,255,255,0.4);
    --radius: 16px;
  }
  body { background: var(--bg); color: var(--white); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }

  /* Header */
  header { border-bottom: 1px solid var(--border); background: var(--surface); padding: 18px 32px; display: flex; align-items: center; gap: 14px; }
  .logo-mark { display: flex; align-items: center; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .brand span { color: var(--green); }
  .badge { margin-left: auto; background: var(--green-dim); border: 1px solid rgba(76,204,60,0.3); color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; padding: 5px 14px; border-radius: 100px; }

  /* Layout */
  main { max-width: 1100px; margin: 0 auto; padding: 40px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 768px) { main { grid-template-columns: 1fr; } }

  /* Cards */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; }
  .card-title { font-size: 13px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--green); margin-bottom: 6px; }
  .card-desc { font-size: 14px; color: var(--muted); margin-bottom: 24px; line-height: 1.5; }

  /* Drop zone */
  .drop-zone {
    border: 2px dashed var(--border); border-radius: 12px; padding: 36px 20px; text-align: center;
    cursor: pointer; transition: border-color 0.2s, background 0.2s; margin-bottom: 16px; position: relative;
  }
  .drop-zone:hover, .drop-zone.drag-over { border-color: var(--green); background: var(--green-dim); }
  .drop-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .drop-icon { font-size: 32px; margin-bottom: 10px; }
  .drop-text { font-size: 14px; color: var(--muted); }
  .drop-text strong { color: var(--white); }
  .file-name { margin-top: 8px; font-size: 13px; color: var(--green); font-weight: 600; }

  /* Form */
  .field { margin-bottom: 16px; }
  label { display: block; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  input[type=text], textarea, select {
    width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px;
    color: var(--white); font-size: 15px; padding: 12px 16px; outline: none; transition: border-color 0.2s;
    font-family: inherit;
  }
  input[type=text]:focus, textarea:focus, select:focus { border-color: rgba(76,204,60,0.5); }
  textarea { resize: vertical; min-height: 90px; }
  select option { background: #1a1e1a; }

  /* Buttons */
  .btn {
    width: 100%; padding: 14px; border-radius: 10px; border: none; cursor: pointer;
    font-size: 15px; font-weight: 700; letter-spacing: 0.5px; transition: opacity 0.2s, transform 0.1s;
  }
  .btn:active { transform: scale(0.98); }
  .btn-primary { background: linear-gradient(135deg, var(--green), var(--green2)); color: white; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .btn-dl { background: var(--surface2); border: 1px solid var(--border); color: var(--white); margin-top: 10px; text-decoration: none; display: block; text-align: center; }
  .btn-dl:hover { border-color: var(--green); color: var(--green); }

  /* Preview */
  .preview-area { margin-top: 20px; display: none; }
  .preview-area.visible { display: block; }
  .preview-area img { width: 100%; border-radius: 10px; border: 1px solid var(--border); display: block; }

  /* Spinner */
  .spinner { display: none; justify-content: center; align-items: center; gap: 10px; margin-top: 16px; color: var(--muted); font-size: 14px; }
  .spinner.visible { display: flex; }
  .spin { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--green); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Error */
  .error-msg { margin-top: 12px; padding: 12px 16px; background: rgba(255,60,60,0.1); border: 1px solid rgba(255,60,60,0.3); border-radius: 10px; font-size: 13px; color: #ff6b6b; display: none; }
  .error-msg.visible { display: block; }

  /* Divider */
  hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
</style>
</head>
<body>

<header>
  <div class="logo-mark">
    <svg width="36" height="36" viewBox="0 0 76 70" fill="none">
      <polygon points="4,66 20,14 38,44 56,14 72,66 62,66 56,34 38,60 20,34 14,66" fill="white"/>
      <polyline points="18,36 30,52 60,16" fill="none" stroke="url(#hg)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <defs>
        <linearGradient id="hg" x1="18" y1="36" x2="60" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#7dde4a"/><stop offset="100%" stop-color="#2a9e30"/>
        </linearGradient>
      </defs>
    </svg>
  </div>
  <div class="brand">check<span>negócios</span></div>
  <div class="badge">Marketing Studio</div>
</header>

<main>

  <!-- ── Cenário 1: Overlay de Logo ── -->
  <div class="card">
    <div class="card-title">Overlay de Logo</div>
    <div class="card-desc">Adiciona o rodapé CheckNegócios em qualquer imagem de parceiro. Aceita JPG, PNG ou WebP.</div>

    <div class="drop-zone" id="dropZone1">
      <input type="file" id="fileInput" accept="image/*">
      <div class="drop-icon">🖼️</div>
      <div class="drop-text"><strong>Clique ou arraste</strong> a imagem aqui</div>
      <div class="file-name" id="fileName1"></div>
    </div>

    <button class="btn btn-primary" id="btnOverlay" disabled>Adicionar Logo CN</button>

    <div class="spinner" id="spin1"><div class="spin"></div> Processando imagem…</div>
    <div class="error-msg" id="err1"></div>

    <div class="preview-area" id="preview1">
      <hr>
      <img id="previewImg1" src="" alt="Preview">
      <a class="btn btn-dl" id="dl1" download="banner-cn.png">⬇ Baixar PNG</a>
    </div>
  </div>

  <!-- ── Cenário 2: Gerar Banner com IA ── -->
  <div class="card">
    <div class="card-title">Gerar Banner com IA</div>
    <div class="card-desc">Descreva o conteúdo e a IA cria um banner no estilo visual CheckNegócios usando GPT-Image.</div>

    <div class="field">
      <label>Título principal</label>
      <input type="text" id="titulo" placeholder="ex: Novo Convênio Banco Daycoval">
    </div>
    <div class="field">
      <label>Subtítulo</label>
      <input type="text" id="subtitulo" placeholder="ex: Crédito Consignado Privado">
    </div>
    <div class="field">
      <label>Empresa / Parceiro</label>
      <input type="text" id="empresa" placeholder="ex: Banco Daycoval">
    </div>
    <div class="field">
      <label>Tipo de conteúdo</label>
      <select id="tipo">
        <option value="Novo Convênio">Novo Convênio</option>
        <option value="Comunicado">Comunicado</option>
        <option value="Promoção">Promoção</option>
        <option value="Novidade">Novidade</option>
        <option value="Alerta">Alerta</option>
        <option value="Informativo">Informativo</option>
      </select>
    </div>
    <div class="field">
      <label>Informações adicionais</label>
      <textarea id="info" placeholder="ex: Taxas a partir de 1,5% a.m. Disponível para servidores públicos e privados."></textarea>
    </div>

    <button class="btn btn-primary" id="btnGenerate">Gerar Banner</button>

    <div class="spinner" id="spin2"><div class="spin"></div> Gerando com GPT-Image… (pode levar ~30s)</div>
    <div class="error-msg" id="err2"></div>

    <div class="preview-area" id="preview2">
      <hr>
      <img id="previewImg2" src="" alt="Banner gerado">
      <a class="btn btn-dl" id="dl2" download="banner-ia.png">⬇ Baixar PNG</a>
    </div>
  </div>

</main>

<script>
// ── Overlay ──────────────────────────────────────────────────────────────────
const fileInput = document.getElementById('fileInput');
const dropZone1 = document.getElementById('dropZone1');
const fileName1 = document.getElementById('fileName1');
const btnOverlay = document.getElementById('btnOverlay');

let selectedFile = null;

function setFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  selectedFile = file;
  fileName1.textContent = file.name;
  btnOverlay.disabled = false;
}

fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

dropZone1.addEventListener('dragover', e => { e.preventDefault(); dropZone1.classList.add('drag-over'); });
dropZone1.addEventListener('dragleave', () => dropZone1.classList.remove('drag-over'));
dropZone1.addEventListener('drop', e => {
  e.preventDefault();
  dropZone1.classList.remove('drag-over');
  setFile(e.dataTransfer.files[0]);
});

btnOverlay.addEventListener('click', async () => {
  if (!selectedFile) return;
  setLoading('overlay', true);
  clearError('err1');
  try {
    // Converte arquivo para base64 no browser antes de enviar como JSON
    const base64 = await fileToBase64(selectedFile);
    const r = await fetch('/overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType: selectedFile.type }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
    showPreview('preview1', 'previewImg1', 'dl1', data.image, 'banner-cn.png');
  } catch(e) {
    showError('err1', e.message);
  } finally {
    setLoading('overlay', false);
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // remove data URI prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Generate ─────────────────────────────────────────────────────────────────
document.getElementById('btnGenerate').addEventListener('click', async () => {
  const titulo = document.getElementById('titulo').value.trim();
  if (!titulo) { showError('err2', 'Preencha ao menos o título.'); return; }

  setLoading('generate', true);
  clearError('err2');
  try {
    const r = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo,
        subtitulo: document.getElementById('subtitulo').value.trim(),
        empresa:   document.getElementById('empresa').value.trim(),
        tipo:      document.getElementById('tipo').value,
        info:      document.getElementById('info').value.trim(),
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
    showPreview('preview2', 'previewImg2', 'dl2', data.image, 'banner-ia.png');
  } catch(e) {
    showError('err2', e.message);
  } finally {
    setLoading('generate', false);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(who, on) {
  const spinId = who === 'overlay' ? 'spin1' : 'spin2';
  const btnId  = who === 'overlay' ? 'btnOverlay' : 'btnGenerate';
  document.getElementById(spinId).classList.toggle('visible', on);
  document.getElementById(btnId).disabled = on;
}

function showPreview(areaId, imgId, dlId, base64, filename) {
  const src = 'data:image/png;base64,' + base64;
  document.getElementById(imgId).src = src;
  const dl = document.getElementById(dlId);
  dl.href = src;
  dl.download = filename;
  document.getElementById(areaId).classList.add('visible');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = 'Erro: ' + msg;
  el.classList.add('visible');
}

function clearError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.remove('visible');
}
</script>
</body>
</html>`;

// ─── Template HTML do banner (comunicados) ────────────────────────────────────
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
.glow { position:absolute; width:700px; height:700px; border-radius:50%; background:radial-gradient(circle, rgba(61,190,60,0.07) 0%, transparent 65%); top:-200px; right:-200px; pointer-events:none; }
.side-bar { position:absolute; top:0; left:0; width:7px; height:100%; background:linear-gradient(180deg, #4ccc3c 0%, #1a8c28 55%, rgba(26,140,40,0) 100%); }
.bottom-bar { position:absolute; bottom:0; left:0; right:0; height:4px; background:linear-gradient(90deg, transparent, #3dbe4a 30%, #1a8c28 70%, transparent); }
.corner-deco { position:absolute; bottom:60px; right:0; width:320px; height:320px; opacity:0.04; }
.header { position:absolute; top:44px; left:52px; right:52px; display:flex; align-items:center; justify-content:space-between; }
.logo-svg { width:180px; }
.tag { background:linear-gradient(135deg, #3dbe4a, #1a7c28); color:#fff; font-family:'Barlow',sans-serif; font-weight:700; font-size:13px; padding:8px 22px; border-radius:100px; letter-spacing:2.5px; text-transform:uppercase; }
.divider { position:absolute; top:148px; left:52px; right:52px; height:1px; background:linear-gradient(90deg, rgba(61,190,74,0.5), rgba(61,190,74,0.1) 60%, transparent); }
.title { position:absolute; top:175px; left:52px; right:52px; }
.title-l1 { font-family:'Barlow',sans-serif; font-weight:300; font-size:${titleSize}; color:rgba(255,255,255,0.75); line-height:1; letter-spacing:-1px; text-transform:uppercase; }
.title-l2 { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:${titleSize}; color:#ffffff; line-height:0.95; letter-spacing:-2px; text-transform:uppercase; margin-top:4px; }
.title-accent { width:64px; height:5px; background:linear-gradient(90deg, #4ccc3c, #1a8c28); border-radius:10px; margin-top:22px; }
.fields { position:absolute; top:${fieldsTop}; left:52px; right:52px; display:flex; flex-direction:column; gap:22px; }
.field-row { display:flex; align-items:center; gap:28px; }
.field-label { font-family:'Barlow',sans-serif; font-weight:700; font-size:13px; color:rgba(255,255,255,0.35); letter-spacing:3px; text-transform:uppercase; min-width:188px; flex-shrink:0; }
.field-value { flex:1; background:linear-gradient(135deg, rgba(61,190,74,0.12), rgba(26,140,40,0.08)); border:1px solid rgba(61,190,74,0.25); border-radius:14px; padding:15px 28px; font-family:'Barlow',sans-serif; font-weight:700; font-size:26px; color:#fff; text-align:center; line-height:1.3; }
.stamp { position:absolute; top:290px; right:52px; width:140px; height:140px; ${mostrar_selo ? '' : 'display:none;'} }
.footer { position:absolute; bottom:22px; left:52px; right:52px; display:flex; align-items:center; justify-content:space-between; }
.footer-url { font-family:'Barlow',sans-serif; font-weight:400; font-size:16px; color:rgba(255,255,255,0.2); letter-spacing:3px; text-transform:uppercase; }
</style>
</head>
<body>
<div class="card">
  <div class="glow"></div>
  <div class="side-bar"></div>
  <div class="bottom-bar"></div>
  <svg class="corner-deco" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="320" cy="320" r="280" stroke="white" stroke-width="2"/>
    <circle cx="320" cy="320" r="200" stroke="white" stroke-width="1.5"/>
    <circle cx="320" cy="320" r="120" stroke="white" stroke-width="1"/>
  </svg>
  <div class="header">
    <svg class="logo-svg" viewBox="0 0 320 80" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <text x="90" y="62" font-family="'Barlow',sans-serif" font-weight="800" font-size="52" fill="white" letter-spacing="-1">check</text>
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
  <div class="title">
    <div class="title-l1">${titulo_linha1}</div>
    <div class="title-l2">${titulo_linha2}</div>
    <div class="title-accent"></div>
  </div>
  <div class="stamp">
    <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="70" cy="70" r="64" stroke="#4ccc3c" stroke-width="2" stroke-dasharray="5 3" opacity="0.6"/>
      <circle cx="70" cy="70" r="52" stroke="#4ccc3c" stroke-width="1.5" opacity="0.4"/>
      <rect x="10" y="53" width="120" height="34" rx="6" fill="#4ccc3c" opacity="0.1"/>
      <rect x="10" y="53" width="120" height="34" rx="6" fill="none" stroke="#4ccc3c" stroke-width="1.5" opacity="0.5"/>
      <text x="70" y="76" font-family="Arial" font-weight="bold" font-size="11" fill="#4ccc3c" text-anchor="middle" opacity="0.8" letter-spacing="2">NOVO CONVÊNIO</text>
    </svg>
  </div>
  <div class="fields">${camposHtml}</div>
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

// ─── Rota: Interface web ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(UI_HTML);
});

// ─── Rota: Overlay de logo CN no rodapé ──────────────────────────────────────
// Aceita JSON: { image: "<base64>", mimeType: "image/jpeg" }
app.post('/overlay', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Campo "image" (base64) é obrigatório' });

    const inputBuf = Buffer.from(image, 'base64');
    const meta = await sharp(inputBuf).metadata();
    const { width, height } = meta;
    console.log(`[Overlay] ${width}x${height}px, format=${meta.format}`);

    // IA decide a estratégia: "place" (espaço vazio) ou "footer" (faixa de rodapé)
    const mimeType = req.body.mimeType || 'image/jpeg';
    const placement = await findLogoPlacement(image, mimeType, width, height);

    // Dimensões do logo (~30% da largura)
    const logoW = Math.round(width * 0.30);
    const logoBuf = await getLogoBuf(logoW);
    const logoMeta = await sharp(logoBuf).metadata();
    const logoH = logoMeta.height;

    let result;

    if (placement.strategy === 'place') {
      // Coloca o logo nas coordenadas escolhidas pela IA
      const left = Math.round((placement.x_pct / 100) * width);
      const top  = Math.round((placement.y_pct / 100) * height);
      result = await sharp(inputBuf)
        .composite([{ input: logoBuf, top, left, blend: 'over' }])
        .png()
        .toBuffer();
    } else {
      // Adiciona faixa de rodapé escura abaixo da imagem e coloca o logo centralizado à esquerda
      const stripH = Math.round(logoH * 1.5);
      const logoTop  = Math.round((stripH - logoH) / 2);
      const logoLeft = Math.round(width * 0.04);
      result = await sharp(inputBuf)
        .extend({ bottom: stripH, background: { r: 17, g: 20, b: 17 } })
        .composite([{ input: logoBuf, top: height + logoTop, left: logoLeft, blend: 'over' }])
        .png()
        .toBuffer();
    }

    const base64 = result.toString('base64');
    res.json({ image: base64 });

  } catch (err) {
    console.error('[Overlay]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Rota: Gerar banner com gpt-image-1 ──────────────────────────────────────
app.post('/generate', async (req, res) => {
  try {
    const { titulo, subtitulo, empresa, tipo, info } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Campo "titulo" é obrigatório' });

    const lines = [
      `Create a vertical marketing story banner (9:16 portrait) for CheckNegócios, a Brazilian B2B financial marketplace.`,
      ``,
      `STRICT VISUAL IDENTITY — follow exactly:`,
      `- Background: very dark near-black (#111411) with subtle dark green gradient tint`,
      `- Left edge: thin vertical bar with green gradient (#4ccc3c to #1a8c28, fading out)`,
      `- Top-right corner: subtle radial green glow (#4ccc3c, 7% opacity)`,
      `- Bottom: thin horizontal green gradient line`,
      `- Typography: bold white sans-serif (Barlow/similar), high contrast on dark`,
      `- Accent color: bright green (#4ccc3c) for highlights, badges, and borders`,
      `- Top-left: "check negócios" logo — stylized M-shape with green checkmark overlay, "check" in bold white, "negócios" in gradient green`,
      `- Bottom-right decoration: faint concentric circles in white (4% opacity)`,
      `- Overall style: modern, premium, professional B2B fintech aesthetic`,
      ``,
      `CONTENT TO DISPLAY:`,
      `• Type badge (top-right pill): "${tipo || 'Comunicado'}"`,
      `• Main title line 1 (light weight): "${titulo.toUpperCase()}"`,
      empresa && `• Main title line 2 (black weight, larger): "${empresa.toUpperCase()}"`,
      subtitulo && `• Subtitle below title: "${subtitulo}"`,
      info && `• Info fields (green-bordered rounded cards): ${info}`,
      `• Footer URL (very subtle, lowercase): "checknegocios.com.br"`,
    ].filter(Boolean).join('\n');

    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: lines,
      size: '1024x1536',
      quality: 'medium',
    });

    const imageBase64 = response.data[0].b64_json;
    res.json({ image: imageBase64 });

  } catch (err) {
    console.error('[Generate]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Rota: Render banner de comunicado (legado) ───────────────────────────────
app.post('/render', async (req, res) => {
  try {
    let data = req.body;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {
        return res.status(400).json({ error: `JSON inválido: ${e.message}` });
      }
    }
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Payload vazio' });
    if (!data.titulo_linha1 || !data.titulo_linha2 || !Array.isArray(data.campos)) {
      return res.status(400).json({ error: 'Necessário: titulo_linha1, titulo_linha2, campos[]' });
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

    res.json({ image: screenshot.toString('base64') });

  } catch (err) {
    console.error('[Render]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── Error handler global (captura erros do multer e outros middlewares) ───────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.message || err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Marketing Studio rodando na porta ${PORT}`));
