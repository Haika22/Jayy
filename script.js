const $ = id => document.getElementById(id);
const C = 2 * Math.PI * 54;

/* hiasan */
(function deco() {
  const words = ['Tempel link SFL', 'Dapat link MediaFire', 'Tombol ditekan otomatis', 'Gratis', 'Enak di HP', 'Jayy'];
  $('track').innerHTML = words.concat(words).map(w => '<span>' + w + '</span>').join('');
  const cols = ['#22d3ee', '#2f7bff', '#ff4d8d', '#ff9f1c', '#a3e635'];
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('span');
    s.className = 'fl';
    s.style.setProperty('--s', (10 + (i * 7) % 22) + 'px');
    s.style.setProperty('--c', cols[i % 5]);
    s.style.left = (5 + i * 11) + '%';
    s.style.animationDuration = (14 + (i * 3) % 9) + 's';
    s.style.animationDelay = (-i * 2.2) + 's';
    document.body.appendChild(s);
  }
  $('ringfg').style.strokeDasharray = C;
  $('ringfg').style.strokeDashoffset = C;
})();

function toast(m) {
  const t = $('toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1700);
}
function confetti() {
  const cols = ['#22d3ee', '#2f7bff', '#ff4d8d', '#ff9f1c', '#a3e635'];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement('i');
    p.className = 'cf';
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.background = cols[i % 5];
    p.style.animationDelay = (Math.random() * 0.5) + 's';
    p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3300);
  }
}

/* statistik & riwayat */
function stat(k, add) {
  try {
    const s = JSON.parse(localStorage.getItem('jayy_stats') || '{}');
    if (add) { s[k] = (s[k] || 0) + 1; localStorage.setItem('jayy_stats', JSON.stringify(s)); }
    return s;
  } catch (e) { return {}; }
}
function showStats() { const s = stat(); $('s-scan').textContent = s.scan || 0; $('s-ok').textContent = s.ok || 0; }
showStats();

function loadHist() { try { return JSON.parse(localStorage.getItem('jayy_hist') || '[]'); } catch (e) { return []; } }
function saveHist(u) {
  try { localStorage.setItem('jayy_hist', JSON.stringify([u].concat(loadHist().filter(x => x !== u)).slice(0, 5))); } catch (e) {}
  renderHist();
}
function renderHist() {
  const h = loadHist(), box = $('hist');
  box.querySelectorAll('.chip').forEach(c => c.remove());
  if (!h.length) { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  h.forEach(u => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = u.replace(/^https?:\/\//, ''); b.dataset.u = u;
    box.appendChild(b);
  });
}
renderHist();
document.addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (c && c.dataset.u) { $('url').value = c.dataset.u; scan(); }
});

function setStatus(m, err) { $('status').textContent = m; $('status').className = err ? 'err' : ''; }
function setStep(n) {
  document.querySelectorAll('.st').forEach((e, i) => { e.classList.toggle('done', i < n); e.classList.toggle('now', i === n); });
}
function ring(sec, label) {
  $('ringfg').style.strokeDashoffset = C * (1 - Math.min(sec / 50, 1));
  $('ringtxt').textContent = label;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render(d) {
  const box = $('result');
  box.innerHTML = '';
  box.className = 'box ' + (d.ok ? 'ok' : 'no');
  box.appendChild(el('h2', '', d.ok ? 'Link MediaFire ditemukan' : 'Belum ketemu'));

  if (d.ok) {
    d.links.forEach(l => {
      const row = el('div', 'row');
      row.appendChild(el('code', '', l));
      const open = el('a', 'btn main', 'Buka');
      open.href = l; open.target = '_blank'; open.rel = 'noopener noreferrer';
      const cp = el('button', 'btn', 'Salin');
      cp.onclick = async () => {
        try { await navigator.clipboard.writeText(l); toast('Link disalin'); }
        catch (e) { toast('Gagal menyalin'); }
      };
      row.appendChild(open); row.appendChild(cp);
      box.appendChild(row);
    });
    box.appendChild(el('p', 'hint', 'Cek nama file sebelum mengunduh.'));
    confetti();
  } else {
    box.appendChild(el('p', 'hint', d.message));
  }

  const det = el('details', 'f');
  det.appendChild(el('summary', '', 'Jalur yang dilewati (' + d.chain.length + ')'));
  const ul = el('ul');
  d.chain.forEach(c => ul.appendChild(el('li', '', '[' + c.status + '] ' + c.url)));
  det.appendChild(ul);
  box.appendChild(det);
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function callApi(path, url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(path + '&url=' + encodeURIComponent(url), { signal: ctrl.signal });
    if (r.status === 404) throw new Error('Fungsi server belum terpasang. Pastikan folder api ikut di-upload ke Vercel.');
    if (r.status === 504 || r.status === 408) throw new Error('Server kehabisan waktu (batas waktu Vercel).');
    let d;
    try { d = await r.json(); } catch (e) { throw new Error('Balasan server tidak terbaca (kode ' + r.status + ').'); }
    if (d.error) throw new Error(d.error);
    return d;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Terlalu lama menunggu server.');
    throw e;
  } finally { clearTimeout(timer); }
}

async function scan() {
  const m = $('url').value.match(/https?:\/\/[^\s]+/i);
  let url = m ? m[0] : $('url').value.trim();
  if (!url) { setStatus('Tempel link SFL dulu ya.', true); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  $('go').disabled = true; $('go').textContent = 'Memindai...';
  $('result').style.display = 'none';
  $('live').style.display = 'flex';
  $('mascot').classList.add('busy');
  stat('scan', true); showStats();
  setStep(0); ring(1, '...');
  setStatus('Tahap 1: mengikuti link...');

  let quick = null, tick = null;
  try {
    quick = await callApi('/api?mode=quick', url, 15000).catch(() => null);
    if (quick && quick.ok) {
      render(quick); saveHist(url); stat('ok', true); showStats();
      setStatus('Selesai.');
      return;
    }

    const t0 = Date.now();
    const upd = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setStep(s < 5 ? 1 : 2);
      ring(s, s + ' dtk');
      setStatus('Tahap 2: Jayy menunggu timer dan menekan tombol otomatis... (maksimal sekitar 50 dtk)');
    };
    upd(); tick = setInterval(upd, 1000);

    const d = await callApi('/api?mode=browser', url, 65000);
    render(d); saveHist(url);
    if (d.ok) { stat('ok', true); showStats(); }
    setStatus(d.ok ? 'Selesai.' : (d.captcha ? 'Ada captcha di halaman ini.' : 'Selesai, tapi link belum muncul.'), !d.ok && d.captcha);
  } catch (e) {
    if (quick) render(quick);
    setStatus(e.message, true);
  } finally {
    if (tick) clearInterval(tick);
    $('live').style.display = 'none';
    $('mascot').classList.remove('busy');
    $('go').disabled = false; $('go').textContent = 'Pindai';
  }
}

$('go').onclick = scan;
$('url').addEventListener('keydown', e => { if (e.key === 'Enter') scan(); });
