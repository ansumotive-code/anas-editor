'use strict';
/* ANAS EDITOR v2 — voice-to-video studio (runs fully in the browser) */
const $ = id => document.getElementById(id);
const canvas = $('preview'), ctx = canvas.getContext('2d');
const audio = $('audio');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const fmt = s => { if (!isFinite(s)) s = 0; return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
function toast(msg, ms = 4500) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
const store = { get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

/* ---------------- state ---------------- */
let ratio = 'landscape', audioFile = null, personImg = null;
const person = { mode: 'left', x: .22, y: .5, scale: .85 };
const capPos = { x: .5, y: .8 };
const wavePos = { x: .5, y: .9 };
let waveStyle = 'neon';
let words = [];                // {w,s,e}
let items = [];                // background playlist {type,el,thumb,name,tainted}
let audioCtx = null, analyser = null, srcNode = null;
let exporting = false, cancelled = false, rec = null;

/* ---------------- audio ---------------- */
function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  srcNode = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .72;
  srcNode.connect(analyser); analyser.connect(audioCtx.destination);
}
$('audioFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  audioFile = f; audio.src = URL.createObjectURL(f); $('audioName').textContent = f.name;
  $('previewHint').textContent = 'Audio loaded · ab background aur captions add karo';
  audio.onloadedmetadata = () => { $('scrub').max = audio.duration || 100; };
});
$('playBtn').onclick = async () => {
  if (!audio.src) { toast('Pehlay voiceover audio upload karo.'); return; }
  ensureAudio(); await audioCtx.resume();
  if (audio.paused) await audio.play(); else audio.pause();
};
audio.addEventListener('play', () => { $('playBtn').textContent = 'Ⅱ Pause'; $('previewHint').style.display = 'none'; });
audio.addEventListener('pause', () => { $('playBtn').textContent = '▶ Play'; });
audio.addEventListener('ended', () => { $('playBtn').textContent = '▶ Play'; });
let scrubbing = false;
$('scrub').addEventListener('pointerdown', () => scrubbing = true);
$('scrub').addEventListener('pointerup', () => scrubbing = false);
$('scrub').addEventListener('input', e => { if (audio.duration) audio.currentTime = +e.target.value; });

/* ---------------- person ---------------- */
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
$('personFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  personImg = await loadImage(URL.createObjectURL(f)); $('personName').textContent = f.name; applyPersonMode();
});
function applyPersonMode() {
  person.mode = $('personMode').value; person.scale = +$('personScale').value / 100;
  if (person.mode === 'left') { person.x = .22; person.y = 1 - person.scale / 2; }
  else if (person.mode === 'right') { person.x = .78; person.y = 1 - person.scale / 2; }
}
$('personMode').onchange = applyPersonMode;
$('personScale').oninput = () => { person.scale = +$('personScale').value / 100; if (person.mode !== 'free') applyPersonMode(); };

/* ---------------- ratio ---------------- */
document.querySelectorAll('[data-ratio]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-ratio]').forEach(x => x.classList.remove('active')); b.classList.add('active');
  ratio = b.dataset.ratio;
  if (ratio === 'vertical') { canvas.width = 720; canvas.height = 1280; } else { canvas.width = 1280; canvas.height = 720; }
  $('stageWrap').classList.toggle('vertical', ratio === 'vertical');
  applyPersonMode();
}));

/* ---------------- background (Pixabay + local) ---------------- */
const CHIPS = ['nature', 'ocean', 'forest', 'waterfall', 'mountains', 'sunset', 'city night', 'clouds', 'space', 'rain'];
$('pbChips').innerHTML = CHIPS.map(c => `<button class="chip" data-q="${c}">${c}</button>`).join('');
$('pbChips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { $('pbQuery').value = b.dataset.q; pbSearch(false); } });
$('pbKey').value = store.get('anas_pixabay_key');
$('pbKey').addEventListener('change', () => { if ($('pbRemember').checked) store.set('anas_pixabay_key', $('pbKey').value.trim()); else store.del('anas_pixabay_key'); });
$('pbRemember').addEventListener('change', () => $('pbKey').dispatchEvent(new Event('change')));
$('pbQuery').addEventListener('keydown', e => { if (e.key === 'Enter') pbSearch(false); });
$('pbSearch').onclick = () => pbSearch(false);
$('pbMore').onclick = () => pbSearch(true);
let pbPage = 1;
async function pbSearch(more) {
  const key = $('pbKey').value.trim();
  if (!key) { toast('Pehlay apni Pixabay API key paste karo (pixabay.com/api/docs).'); return; }
  $('pbKey').dispatchEvent(new Event('change'));
  const q = encodeURIComponent($('pbQuery').value.trim() || 'nature'), type = $('pbType').value;
  pbPage = more ? pbPage + 1 : 1;
  const url = type === 'video'
    ? `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${q}&per_page=12&page=${pbPage}&safesearch=true`
    : `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${q}&image_type=photo&orientation=${ratio === 'vertical' ? 'vertical' : 'horizontal'}&per_page=12&page=${pbPage}&safesearch=true`;
  $('pbSearch').textContent = '...';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status === 400 || r.status === 401 || r.status === 403 ? 'API key galat lagti hai' : 'Pixabay error ' + r.status);
    const data = await r.json();
    if (!more) $('pbResults').innerHTML = '';
    if (!data.hits || !data.hits.length) { toast('Is search par kuch nahi mila. Doosra word try karo.'); }
    (data.hits || []).forEach(h => {
      const d = document.createElement('div'); d.className = 'thumb';
      let thumb, src, name;
      if (type === 'video') {
        const v = h.videos || {}; src = (v.medium || v.small || v.large || v.tiny || {}).url;
        thumb = (v.tiny && v.tiny.thumbnail) || (v.small && v.small.thumbnail) || `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`;
        name = 'video ' + h.id; d.innerHTML = `<img src="${thumb}" alt=""><em>${fmt(h.duration)}</em>`;
      } else { src = h.largeImageURL || h.webformatURL; thumb = h.previewURL || h.webformatURL; name = 'photo ' + h.id; d.innerHTML = `<img src="${thumb}" alt="">`; }
      d.onclick = async () => { if (d.classList.contains('added') || !src) return; d.classList.add('added'); await addMedia(type, src, thumb, name); };
      $('pbResults').appendChild(d);
    });
    $('pbMore').style.display = (data.hits && data.hits.length >= 12) ? 'block' : 'none';
  } catch (err) { toast('Pixabay search fail: ' + err.message); }
  $('pbSearch').textContent = 'Search';
}
async function addMedia(type, url, thumb, name) {
  toast('Clip add ho rahi hai...', 2500);
  let src = url, tainted = false;
  try { const r = await fetch(url); if (!r.ok) throw 0; src = URL.createObjectURL(await r.blob()); }
  catch (e) { tainted = true; }
  const make = cors => new Promise(res => {
    const el = type === 'video' ? document.createElement('video') : new Image();
    if (cors) el.crossOrigin = 'anonymous';
    if (type === 'video') { el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'auto'; el.onloadeddata = () => res(el); }
    else el.onload = () => res(el);
    el.onerror = () => res(null); el.src = src;
  });
  let el = await make(tainted);
  if (!el && tainted) { el = await make(false); }
  if (!el) { toast('Ye clip load nahi hui. Koi doosri try karo.'); return; }
  items.push({ type, el, thumb, name, tainted: tainted && !el.crossOrigin });
  renderPlaylist(); toast('Added ✓ (' + items.length + ' clips)', 1800);
}
$('bgFiles').addEventListener('change', async e => {
  for (const f of e.target.files) { const u = URL.createObjectURL(f); const type = f.type.startsWith('video') ? 'video' : 'photo'; await addMedia(type, u, type === 'photo' ? u : '', f.name); }
  e.target.value = '';
});
function renderPlaylist() {
  const pl = $('playlist'); $('plCount').textContent = items.length ? '(' + items.length + ')' : '';
  if (!items.length) { pl.innerHTML = '<small class="helper">Search results me clip par click karo to yahan add ho jayegi.</small>'; return; }
  pl.innerHTML = '';
  items.forEach((it, i) => {
    const d = document.createElement('div'); d.className = 'pl-item';
    d.innerHTML = (it.thumb ? `<img src="${it.thumb}" alt="">` : '') + `<span>${i + 1}</span><button title="Remove">×</button>`;
    d.querySelector('button').onclick = () => { it.el.pause && it.el.pause(); items.splice(i, 1); renderPlaylist(); };
    pl.appendChild(d);
  });
}
$('plClear').onclick = () => { items.forEach(i => i.el.pause && i.el.pause()); items = []; renderPlaylist(); };
$('bgInterval').oninput = () => $('bgIntervalVal').textContent = $('bgInterval').value + 's';
$('bgShade').oninput = () => $('bgShadeVal').textContent = $('bgShade').value + '%';

function mediaSize(it) { return it.type === 'video' ? [it.el.videoWidth, it.el.videoHeight] : [it.el.naturalWidth, it.el.naturalHeight]; }
function drawMedia(it, x, y, w, h, alpha, zoom) {
  const [iw, ih] = mediaSize(it); if (!iw) return;
  const r = Math.max(w / iw, h / ih) * zoom, dw = iw * r, dh = ih * r;
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(it.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}
function drawBackground(W, H, t) {
  const n = items.length; if (!n) return;
  const iv = +$('bgInterval').value, idx = Math.floor(t / iv) % n, el = t % iv;
  const style = $('bgTransition').value, dur = +$('bgTransDur').value, motion = $('bgMotion').checked;
  const inTrans = n > 1 && style !== 'cut' && el < dur && t >= iv;
  const cur = items[idx], prev = items[(idx - 1 + n) % n];
  const playing = !audio.paused;
  items.forEach(it => { if (it.type !== 'video') return; const active = it === cur || (inTrans && it === prev); if (playing && active) { if (it.el.paused) it.el.play().catch(() => {}); } else if (!it.el.paused) it.el.pause(); });
  const kb = it => (it.type === 'photo' && motion) ? 1 + .06 * (el / iv) : 1;
  if (!inTrans) { drawMedia(cur, 0, 0, W, H, 1, kb(cur) * (style === 'fadezoom' ? 1.02 : 1)); return; }
  const p = el / dur;
  if (style === 'slide') { drawMedia(prev, -p * W, 0, W, H, 1, 1); drawMedia(cur, (1 - p) * W, 0, W, H, 1, 1); }
  else { drawMedia(prev, 0, 0, W, H, 1, style === 'fadezoom' ? 1.03 : 1); drawMedia(cur, 0, 0, W, H, p, style === 'fadezoom' ? 1 + .03 * (1 - p) : kb(cur)); }
}

/* ---------------- person draw ---------------- */
const hit = { cap: null, wave: null, person: null };
function drawPerson(W, H) {
  hit.person = null; if (!personImg) return;
  const r = personImg.width / personImg.height; let h = H * person.scale, w = h * r;
  if (w > W * .95) { w = W * .95; h = w / r; }
  const cx = person.x * W, cy = person.y * H, x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  if ($('personCard').checked) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 26); ctx.clip(); }
  else { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30; }
  if ($('personFlip').checked) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
  ctx.drawImage(personImg, x, y, w, h); ctx.restore();
  hit.person = { x, y, w, h };
}

/* ---------------- captions ---------------- */
const DEMO = ['YOUR', 'CAPTIONS', 'LOOK', 'LIKE', 'THIS'].map((w, i) => ({ w, s: i * .55, e: i * .55 + .5 }));
const COMBOS = [['White + Yellow', '#ffffff', '#ffd400'], ['White + Red', '#ffffff', '#ff2d2d'], ['White + Green', '#ffffff', '#22e55c'], ['White + Cyan', '#ffffff', '#18e0ff'], ['White + Pink', '#ffffff', '#ff4fd8'], ['White + Orange', '#ffffff', '#ff8a1f'], ['White + Purple', '#ffffff', '#b46bff'], ['Yellow + White', '#ffd400', '#ffffff']];
$('colorChips').innerHTML = COMBOS.map((c, i) => `<button class="chip${i === 0 ? ' sel' : ''}" data-i="${i}"><span class="ab" style="color:${c[1]}">AB</span><span class="ab" style="color:${c[2]}">CD</span>${c[0]}</button>`).join('');
$('colorChips').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return; const c = COMBOS[+b.dataset.i];
  $('capBase').value = c[1]; $('capAccent').value = c[2];
  document.querySelectorAll('#colorChips .chip').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
});
$('capSize').oninput = () => $('capSizeVal').textContent = $('capSize').value;
$('capFont').onchange = () => document.fonts.load(`800 40px "${$('capFont').value}"`);
$('resetCap').onclick = () => { capPos.x = .5; capPos.y = .8; };

function paintWord(c, s, px, py, fs, col, acc, look, active) {
  c.lineJoin = 'round';
  if (look === 'flat') { c.fillStyle = col; c.fillText(s, px, py); }
  else if (look === 'neon') { c.shadowColor = col; c.shadowBlur = fs * .5; c.fillStyle = col; c.fillText(s, px, py); c.shadowBlur = fs * .14; c.fillText(s, px, py); c.shadowBlur = 0; }
  else if (look === 'shadow') { c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = fs * .22; c.shadowOffsetY = fs * .05; c.fillStyle = col; c.fillText(s, px, py); c.shadowBlur = 0; c.shadowOffsetY = 0; }
  else if (look === 'outline') { c.strokeStyle = acc; c.lineWidth = fs * .1; c.strokeText(s, px, py); c.fillStyle = active ? acc : '#fff'; c.fillText(s, px, py); }
  else if (look === 'bar') { c.fillStyle = col; c.fillText(s, px, py); }
  else if (look === 'hl-active') { c.fillStyle = col; c.fillText(s, px, py); }
  else { c.strokeStyle = '#000'; c.lineWidth = fs * .15; c.strokeText(s, px, py); c.fillStyle = col; c.fillText(s, px, py); }
}
function drawWord(c, txt, x, y, fs, col, acc, look, active, wave, tt) {
  c.save(); c.translate(x, y);
  const w = c.measureText(txt).width; let lk = look;
  if (look === 'highlighter') {
    if (active) { c.fillStyle = acc; c.beginPath(); c.roundRect(-w / 2 - fs * .2, -fs * .56, w + fs * .4, fs * 1.12, fs * .22); c.fill(); col = '#101418'; lk = 'hl-active'; }
    else lk = 'classic';
  }
  if (wave) { let x0 = -w / 2; for (const ch of txt) { const cw = c.measureText(ch).width; paintWord(c, ch, x0 + cw / 2, Math.sin(tt * 9 + x0 * .03) * fs * .08, fs, col, acc, lk, active); x0 += cw; } }
  else paintWord(c, txt, 0, 0, fs, col, acc, lk, active);
  c.restore();
}
function drawCaption(c, W, H, tt) {
  const vertical = ratio === 'vertical';
  const fs = +$('capSize').value * (vertical ? 1.1 : W / 1280);
  const cx = capPos.x * W, cy = capPos.y * H;
  hit.cap = { x: cx - W * .3, y: cy - fs, w: W * .6, h: fs * 2 };
  let ws = words, t = tt;
  if (!ws.length) { ws = DEMO; t = (performance.now() / 1000) % (DEMO.length * .55 + .9); }
  let ai = -1; for (let i = 0; i < ws.length; i++) { if (t >= ws[i].s) ai = i; else break; }
  if (ai < 0 || t > ws[ai].e + .9) return;
  const per = +$('capPer').value, a = Math.floor(ai / per) * per, b = Math.min(ws.length, a + per);
  const anim = $('capAnim').value, look = $('capLook').value, base = $('capBase').value, acc = $('capAccent').value;
  const upper = $('capUpper').checked, rtl = $('capRTL').checked;
  const font = $('capFont').value, weight = (font === 'Anton' || font === 'Bebas Neue') ? 400 : 800;
  c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${weight} ${fs}px "${font}", Inter, Arial, sans-serif`;
  const gap = fs * .3, maxW = W * .86, lh = fs * 1.2;
  const its = []; for (let i = a; i < b; i++) { const txt = upper ? ws[i].w.toUpperCase() : ws[i].w; its.push({ i, txt, w: c.measureText(txt).width }); }
  const lines = [[]]; let lw = 0;
  for (const it of its) { const cur = lines[lines.length - 1], add = (cur.length ? gap : 0) + it.w; if (cur.length && lw + add > maxW) { lines.push([it]); lw = it.w; } else { cur.push(it); lw += add; } }
  const lwid = lines.map(l => l.reduce((s, it, k) => s + it.w + (k ? gap : 0), 0)), bw = Math.max(...lwid), bh = lines.length * lh, top = cy - bh / 2;
  const pad = fs * .3; hit.cap = { x: cx - bw / 2 - pad, y: top - pad, w: bw + pad * 2, h: bh + pad * 2 };
  const ga = t - ws[a].s; let gA = 1, gS = 1, gY = 0;
  if (anim === 'slide') { const p = clamp(ga / .25, 0, 1); gY = (1 - ease(p)) * fs * .8; gA = ease(p); }
  else if (anim === 'fade') gA = clamp(ga / .2, 0, 1);
  else if (anim === 'pop') gS = .6 + .4 * easeBack(clamp(ga / .22, 0, 1));
  c.translate(cx, cy + gY); c.scale(gS, gS); c.translate(-cx, -cy); c.globalAlpha = gA;
  if (look === 'bar') { c.fillStyle = 'rgba(8,12,18,.72)'; c.beginPath(); c.roundRect(cx - bw / 2 - fs * .5, top - fs * .05, bw + fs, bh + fs * .1, fs * .3); c.fill(); }
  lines.forEach((line, li) => {
    const ordered = rtl ? line.slice().reverse() : line; let x = cx - lwid[li] / 2; const y = top + li * lh + lh / 2;
    ordered.forEach(it => {
      const wx = x + it.w / 2; x += it.w + gap;
      const idx = it.i, active = idx === ai; if (anim === 'type' && idx > ai) return;
      const age = t - ws[idx].s, p = clamp(age / .2, 0, 1);
      let sc = 1, ox = 0, oy = 0, alpha = 1;
      if (active) {
        if (anim === 'pop') sc = 1.12; else if (anim === 'bounce') { oy = -Math.sin(p * Math.PI) * fs * .22; sc = 1.08; }
        else if (anim === 'zoom') { sc = 1.1 + .5 * (1 - ease(p)); alpha = .55 + .45 * ease(p); }
        else if (anim === 'karaoke') sc = 1.06; else if (anim === 'type') sc = .8 + .2 * easeBack(p);
        else if (anim === 'glitch' && age < .3) ox = (Math.random() - .5) * fs * .12;
      }
      const col = anim === 'karaoke' ? (idx <= ai ? acc : base) : (active ? acc : base);
      c.save(); c.globalAlpha = gA * alpha; c.translate(wx + ox, y + oy); c.scale(sc, sc);
      if (anim === 'glitch' && active && age < .3) { drawWord(c, it.txt, -fs * .05, 0, fs, '#ff2a6d', acc, 'flat', false, false, tt); drawWord(c, it.txt, fs * .05, 0, fs, '#05d9e8', acc, 'flat', false, false, tt); }
      drawWord(c, it.txt, 0, 0, fs, col, acc, look, active, anim === 'wave', tt);
      c.restore();
    });
  });
  c.restore();
}

/* ---- transcript tools ---- */
function distribute(tokens, start, end) {
  const total = tokens.reduce((a, t) => a + t.length + 1.5, 0); let cur = start;
  return tokens.map(t => { const d = (end - start) * (t.length + 1.5) / total; const o = { w: t, s: cur, e: cur + d * .92 }; cur += d; return o; });
}
function syncText() { $('transcript').value = words.map(w => w.w).join(' '); }
$('applyText').onclick = () => {
  const tokens = $('transcript').value.split(/\s+/).filter(Boolean);
  if (!tokens.length) { toast('Pehlay text likho ya paste karo.'); return; }
  if (words.length === tokens.length) { words.forEach((w, i) => w.w = tokens[i]); toast('Text update ho gaya (timing same).'); return; }
  const start = words.length ? words[0].s : 0, end = words.length ? words[words.length - 1].e : (audio.duration || tokens.length * .4);
  words = distribute(tokens, start, end); toast('Script audio ki length ke hisab se time ho gaya. Whisper se behtar sync milta hai.');
};
$('clearCaps').onclick = () => { words = []; $('transcript').value = ''; $('capStatus').textContent = 'Captions clear.'; };
$('srtFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return; const txt = await f.text(); const out = [];
  if (/\.json$/i.test(f.name)) { try { applyLoaded(JSON.parse(txt).words); } catch (err) { toast('JSON file sahi nahi hai.'); } e.target.value = ''; return; }
  const ts = s => { const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
  txt.replace(/\r/g, '').split(/\n\n+/).forEach(block => {
    const lines = block.split('\n'), ti = lines.findIndex(l => l.includes('-->')); if (ti < 0) return;
    const [a, b] = lines[ti].split('-->'), tokens = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean);
    if (tokens.length) out.push(...distribute(tokens, ts(a), ts(b)));
  });
  if (out.length) { words = out; syncText(); toast('SRT import ho gayi (' + out.length + ' words).'); } else toast('SRT me cues nahi mile.');
  e.target.value = '';
});

/* ---- load captions made in Caption Maker ---- */
function applyLoaded(arr) {
  const ok = Array.isArray(arr) ? arr.filter(w => w && typeof w.w === 'string' && isFinite(w.s) && isFinite(w.e)) : [];
  if (!ok.length) { toast('Captions nahi mile.'); return; }
  words = ok.map(w => ({ w: w.w, s: +w.s, e: +w.e })); syncText();
  $('capStatus').textContent = 'Loaded ✓ ' + words.length + ' words.'; toast('Captions load ho gaye!');
}
$('loadLast').onclick = () => {
  let j = null; try { j = JSON.parse(localStorage.getItem('anas_captions_v1') || 'null'); } catch (e) {}
  if (!j) { toast('Abhi koi caption nahi bana. Pehlay Caption Maker se banao.'); return; }
  applyLoaded(j.words);
};

/* ---------------- audio waves ---------------- */
const WAVES = {
  simple: [['bars', 'Pulse Bars'], ['mirror', 'Mirror'], ['line', 'Smooth Line'], ['dots', 'Dot Matrix'], ['ring', 'Audio Ring']],
  premium: [['neon', 'Neon Glow'], ['capsule', 'Capsule Reflect'], ['radial', 'Radial Burst'], ['pulse', 'Pulse Rings'], ['liquid', 'Liquid Wave']]
};
const WN = { bars: 40, mirror: 40, line: 24, dots: 32, ring: 48, neon: 36, capsule: 28, radial: 64, pulse: 16, liquid: 32 };
const CIRC = ['ring', 'radial', 'pulse'];
['simple', 'premium'].forEach(g => {
  $(g === 'simple' ? 'waveSimple' : 'wavePremium').innerHTML = WAVES[g].map(([k, n]) => `<button class="template${k === waveStyle ? ' wave-selected' : ''}" data-wave="${k}"><canvas width="140" height="60"></canvas><small>${n}</small></button>`).join('');
});
document.querySelectorAll('.template[data-wave]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.template[data-wave]').forEach(x => x.classList.remove('wave-selected')); b.classList.add('wave-selected'); waveStyle = b.dataset.wave;
}));
$('resetWave').onclick = () => { wavePos.x = .5; wavePos.y = .9; };

const freq = new Uint8Array(128), smooth = new Float32Array(256);
function waveData(n) {
  const live = analyser && !audio.paused; if (live) analyser.getByteFrequencyData(freq);
  const tm = performance.now() / 1000, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs((i + .5) / n * 2 - 1); let v;
    if (live) v = Math.pow(freq[Math.floor(Math.pow(k, 1.3) * 70)] / 255, 1.15) * 1.3;
    else v = .14 + .1 * Math.sin(tm * 2 + i * .5) * (1 - k * .5) + .06 * Math.sin(tm * 3.1 + i * 1.3);
    smooth[i] += (clamp(v, .03, 1) - smooth[i]) * .4; out[i] = smooth[i];
  }
  return out;
}
function fakeData(n, tm) { const o = []; for (let i = 0; i < n; i++) { const k = Math.abs((i + .5) / n * 2 - 1); o.push(clamp((.25 + .55 * Math.abs(Math.sin(tm * 2.4 + i * .7))) * (1 - k * .5), .05, 1)); } return o; }
function pill(c, x, y, w, h) { c.beginPath(); c.roundRect(x, y, w, h, Math.min(w, h) / 2); }
function curve(c, p, first) {
  if (first) c.moveTo(p[0][0], p[0][1]); else c.lineTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
  const l = p[p.length - 1]; c.lineTo(l[0], l[1]);
}
function drawWaveStyle(c, st, cx, cy, w, h, d, c1, c2, tm) {
  const n = d.length, R = Math.min(w, h) / 2; c.save(); c.translate(cx, cy); c.lineCap = 'round'; c.lineJoin = 'round';
  const grad = () => { const g = c.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; };
  const s = w / n;
  switch (st) {
    case 'bars': { c.fillStyle = c1; const bw = s * .6; for (let i = 0; i < n; i++) { const bh = Math.max(4, d[i] * h); c.fillRect(-w / 2 + i * s + (s - bw) / 2, -bh / 2, bw, bh); } break; }
    case 'mirror': { const bw = s * .6; for (let i = 0; i < n; i++) { const bh = Math.max(3, d[i] * h / 2), x = -w / 2 + i * s + (s - bw) / 2; c.fillStyle = c1; c.fillRect(x, -bh, bw, bh); c.globalAlpha = .35; c.fillRect(x, 3, bw, bh * .6); c.globalAlpha = 1; } break; }
    case 'line': { const p = d.map((v, i) => [-w / 2 + i * w / (n - 1), (i % 2 ? -1 : 1) * v * h / 2]); c.strokeStyle = c1; c.lineWidth = Math.max(3, h * .05); c.beginPath(); curve(c, p, true); c.stroke(); break; }
    case 'dots': { const r = Math.max(2, s * .22); c.fillStyle = c1; for (let i = 0; i < n; i++) { const x = -w / 2 + i * s + s / 2, cnt = Math.max(1, Math.round(d[i] * 7)); for (let j = 0; j < cnt; j++) { const y = j * r * 2.6; c.globalAlpha = 1 - j * .09; c.beginPath(); c.arc(x, -y, r, 0, 7); c.fill(); if (j) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } } } c.globalAlpha = 1; break; }
    case 'ring': { const r0 = R * .5; c.strokeStyle = c1; c.lineWidth = Math.max(2, R * .05); c.beginPath(); c.arc(0, 0, r0, 0, 7); c.stroke(); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, l = d[i] * R * .45 + 2; c.beginPath(); c.moveTo(Math.cos(a) * (r0 + 4), Math.sin(a) * (r0 + 4)); c.lineTo(Math.cos(a) * (r0 + 4 + l), Math.sin(a) * (r0 + 4 + l)); c.stroke(); } break; }
    case 'neon': { const bw = s * .55; c.fillStyle = grad(); c.shadowColor = c1; c.shadowBlur = 16; for (let i = 0; i < n; i++) { const bh = Math.max(bw, d[i] * h); pill(c, -w / 2 + i * s + (s - bw) / 2, -bh / 2, bw, bh); c.fill(); } break; }
    case 'capsule': { const bw = s * .62, base = h * .18; for (let i = 0; i < n; i++) { const bh = Math.max(bw, d[i] * h * .8), x = -w / 2 + i * s + (s - bw) / 2; const g = c.createLinearGradient(0, base - bh, 0, base); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g; pill(c, x, base - bh, bw, bh); c.fill(); c.globalAlpha = .22; c.fillStyle = c2; pill(c, x, base + bw * .4, bw, Math.max(bw, bh * .4)); c.fill(); c.globalAlpha = 1; } break; }
    case 'radial': { const r0 = R * .38; c.lineWidth = Math.max(2, R * .045); c.shadowColor = c1; c.shadowBlur = 12; const rot = tm * .35; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rot, l = d[i] * R * .62 + R * .05; c.strokeStyle = i % 2 ? c2 : c1; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * (r0 + l), Math.sin(a) * (r0 + l)); c.stroke(); } c.shadowBlur = 0; c.strokeStyle = c1; c.globalAlpha = .5; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r0 - R * .06, 0, 7); c.stroke(); break; }
    case 'pulse': { const bass = d[Math.floor(n / 2)] || 0; c.shadowColor = c1; c.shadowBlur = 18; for (let k = 0; k < 4; k++) { const rr = R * (.28 + .17 * k) + d[(k * 3) % n] * R * .22 + bass * R * .08; c.strokeStyle = k % 2 ? c2 : c1; c.globalAlpha = 1 - k * .2; c.lineWidth = Math.max(2, R * .045); c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke(); } c.globalAlpha = .35; c.fillStyle = c1; c.shadowBlur = 0; c.beginPath(); c.arc(0, 0, R * .22 * (1 + bass * .6), 0, 7); c.fill(); break; }
    case 'liquid': { const top = d.map((v, i) => [-w / 2 + i * w / (n - 1), -v * h / 2]), bot = d.map((v, i) => [-w / 2 + i * w / (n - 1), v * h / 2]).reverse(); c.beginPath(); curve(c, top, true); curve(c, bot, false); c.closePath(); c.shadowColor = c1; c.shadowBlur = 16; c.globalAlpha = .82; c.fillStyle = grad(); c.fill(); c.globalAlpha = 1; c.strokeStyle = grad(); c.lineWidth = 3; c.stroke(); break; }
  }
  c.restore();
}
function drawMainWave(W, H) {
  hit.wave = null; if (!$('waveOn').checked) return;
  const circ = CIRC.includes(waveStyle); let w = W * $('waveW').value / 100, h = H * $('waveH').value / 100;
  if (circ) { w = h = Math.min(W, H) * $('waveH').value / 100 * 2.2; }
  const cx = wavePos.x * W, cy = wavePos.y * H;
  drawWaveStyle(ctx, waveStyle, cx, cy, w, h, waveData(WN[waveStyle]), $('waveColor').value, $('waveColor2').value, performance.now() / 1000);
  hit.wave = { x: cx - w / 2, y: cy - h / 2 - 6, w, h: h + 12 };
}
let thumbFrame = 0;
function drawThumbs() {
  if (++thumbFrame % 3) return; const tm = performance.now() / 1000;
  document.querySelectorAll('.template[data-wave]').forEach(b => {
    const cv = b.querySelector('canvas'), c = cv.getContext('2d'), k = b.dataset.wave; c.clearRect(0, 0, cv.width, cv.height);
    drawWaveStyle(c, k, cv.width / 2, cv.height / 2, cv.width * .85, cv.height * .7, fakeData(WN[k], tm), $('waveColor').value, $('waveColor2').value, tm);
  });
}

/* ---------------- drag positions ---------------- */
let drag = null, hover = null;
const objOf = k => k === 'cap' ? capPos : k === 'wave' ? wavePos : person;
const pos = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height }; };
const pick = p => { for (const k of ['cap', 'wave', 'person']) { const b = hit[k]; if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return k; } return null; };
canvas.addEventListener('pointerdown', e => {
  const p = pos(e), k = pick(p); if (!k) return; const o = objOf(k);
  drag = { k, ox: p.x - o.x * canvas.width, oy: p.y - o.y * canvas.height }; canvas.setPointerCapture(e.pointerId);
  if (k === 'person' && person.mode !== 'free') { person.mode = 'free'; $('personMode').value = 'free'; }
});
canvas.addEventListener('pointermove', e => {
  const p = pos(e);
  if (drag) { const o = objOf(drag.k); o.x = clamp((p.x - drag.ox) / canvas.width, 0, 1); o.y = clamp((p.y - drag.oy) / canvas.height, 0, 1); canvas.style.cursor = 'grabbing'; }
  else { hover = pick(p); canvas.style.cursor = hover ? 'grab' : 'default'; }
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { hover = null; });

/* ---------------- main draw loop ---------------- */
function draw() {
  const W = canvas.width, H = canvas.height, t = audio.currentTime || 0;
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#15212b'); g.addColorStop(.55, '#243a43'); g.addColorStop(1, '#0c1118'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!items.length) { ctx.fillStyle = '#6f8294'; ctx.font = `600 ${W * .022}px Inter`; ctx.textAlign = 'center'; ctx.fillText('Pixabay se background videos/photos add karo', W / 2, H * .45); }
  drawBackground(W, H, t);
  const shade = +$('bgShade').value / 100; if (items.length && shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, W, H); }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.38)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  drawPerson(W, H); drawMainWave(W, H); drawCaption(ctx, W, H, t);
  if (!exporting) {
    const k = drag ? drag.k : hover, b = k && hit[k];
    if (b) { ctx.save(); ctx.setLineDash([10, 7]); ctx.strokeStyle = '#65f5d0'; ctx.lineWidth = 2.5; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore(); }
  }
  $('timeReadout').textContent = fmt(t) + ' / ' + fmt(audio.duration || 0);
  if (!scrubbing) $('scrub').value = t;
  if (exporting && audio.duration) { $('exportBar').style.width = (t / audio.duration * 100) + '%'; $('exportText').textContent = `Recording... ${fmt(t)} / ${fmt(audio.duration)}`; }
}
function tick() { draw(); if (!exporting) drawThumbs(); requestAnimationFrame(tick); }

/* ---------------- export ---------------- */
$('exportBtn').onclick = async () => {
  if (exporting) { cancelled = true; try { audio.pause(); rec.stop(); } catch (e) {} return; }
  if (!audio.src) { toast('Pehlay voiceover audio upload karo.'); return; }
  if (typeof MediaRecorder === 'undefined') { toast('Is browser me export support nahi. Chrome/Edge use karo.'); return; }
  ensureAudio(); await audioCtx.resume();
  if (items.some(i => i.tainted)) toast('Warning: kuch Pixabay clips CORS ki wajah se export me blank aa sakti hain. Unhe download karke "+ Apni video" se add karo.', 8000);
  const stream = canvas.captureStream(30), dest = audioCtx.createMediaStreamDestination(); srcNode.connect(dest);
  dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '', chunks = []; cancelled = false;
  rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined);
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const onEnd = () => setTimeout(() => { try { rec.stop(); } catch (e) {} }, 400);
  rec.onstop = () => {
    audio.removeEventListener('ended', onEnd); try { srcNode.disconnect(dest); } catch (e) {}
    exporting = false; $('exportBtn').textContent = '⬇ Export video'; $('exportBar').style.width = '0';
    if (cancelled) { $('exportText').textContent = 'Export cancel ho gaya.'; return; }
    const type = rec.mimeType || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm', blob = new Blob(chunks, { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'anas-editor-video.' + ext; document.body.appendChild(a); a.click(); a.remove();
    $('exportText').textContent = 'Done ✓ ' + ext.toUpperCase() + ' download ho gayi.'; toast('Video ready: ' + ext.toUpperCase() + ' file download ho gayi.');
  };
  audio.pause(); audio.currentTime = 0; exporting = true; $('exportBtn').textContent = '■ Cancel export';
  audio.addEventListener('ended', onEnd); rec.start(500); await audio.play();
};

$('resetBtn').onclick = () => { if (confirm('Poora project reset karna hai?')) location.reload(); };
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.nav').forEach(x => x.classList.remove('active')); b.classList.add('active');
  const p = $(b.dataset.jump); p.open = true; p.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.fonts.load('800 40px Inter');
applyPersonMode(); tick();
