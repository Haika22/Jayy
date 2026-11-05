// Jayy - fungsi server. ?mode=quick = tahap cepat, ?mode=browser = browser otomatis.
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

function blocked(u) {
  if (!/^https?:$/.test(u.protocol)) return true;
  const h = u.hostname.toLowerCase();
  return /^(localhost|.*\.local|.*\.internal)$/.test(h) ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h === '::1' || h.startsWith('[');
}

function fromB64(s) {
  try { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
  catch (e) { return ''; }
}

function normalize(t) {
  return t.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

function extract(text) {
  const out = new Set();
  const re = /https?:\/\/(?:www\.|download\d*\.)?mediafire\.com\/[^\s"'<>\\)\]]+/gi;
  const scan = t => (t.match(re) || []).forEach(x => out.add(x.replace(/[.,;]+$/, '')));
  const t = normalize(text);
  scan(t);
  try { scan(decodeURIComponent(t)); } catch (e) {}
  (t.match(/[A-Za-z0-9+/_-]{24,}={0,2}/g) || []).slice(0, 300).forEach(c => {
    const d = fromB64(c);
    if (/mediafire\.com/i.test(d)) scan(normalize(d));
  });
  return [...out];
}

const LIMIT = 45000;

async function quick(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let cur;
  try { cur = new URL((req.query && req.query.url) || ''); }
  catch (e) { return res.status(400).json({ error: 'Link tidak valid' }); }

  const start = Date.now();
  const chain = [];
  const found = new Set();
  const jar = {};

  for (let hop = 0; hop < 8; hop++) {
    const left = 8800 - (Date.now() - start);
    if (left < 800) { chain.push({ url: cur.href, status: 'waktu habis' }); break; }
    if (blocked(cur)) { chain.push({ url: cur.href, status: 'alamat tidak diizinkan' }); break; }

    extract(cur.href).forEach(x => found.add(x));
    if (/(^|\.)mediafire\.com$/i.test(cur.hostname)) { found.add(cur.href); chain.push({ url: cur.href, status: 'MediaFire' }); break; }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(5000, left));
    let r, body = '';
    try {
      r = await fetch(cur.href, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'id,en;q=0.8',
          'Cookie': Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ')
        }
      });
      const sc = (r.headers.getSetCookie ? r.headers.getSetCookie() : []);
      sc.forEach(c => { const p = c.split(';')[0]; const i = p.indexOf('='); if (i > 0) jar[p.slice(0, i)] = p.slice(i + 1); });

      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, cur);
        chain.push({ url: cur.href, status: r.status });
        extract(next.href).forEach(x => found.add(x));
        if (found.size) { chain.push({ url: next.href, status: 'tujuan' }); break; }
        cur = next;
        continue;
      }

      const buf = Buffer.from(await r.arrayBuffer());
      body = buf.slice(0, 2 * 1024 * 1024).toString('utf8');
      chain.push({ url: cur.href, status: r.status });
    } catch (e) {
      chain.push({ url: cur.href, status: 'gagal: ' + (e.name === 'AbortError' ? 'terlalu lama' : e.message) });
      break;
    } finally { clearTimeout(timer); }

    extract(body).forEach(x => found.add(x));
    if (found.size) break;

    const meta = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i);
    const js = body.match(/(?:location\.href|location\.replace\(|window\.location(?:\.href)?)\s*=?\s*\(?\s*["']([^"']+)["']/i);
    const nxt = (meta && meta[1]) || (js && js[1]);
    if (!nxt) break;
    try { const n = new URL(normalize(nxt), cur); if (n.href === cur.href) break; cur = n; } catch (e) { break; }
  }

  const links = [...found];
  return res.status(200).json({
    ok: links.length > 0,
    links,
    chain,
    message: links.length ? 'Link MediaFire ditemukan' :
      'Link MediaFire tidak terlihat di halaman. Kemungkinan link ini butuh hitung mundur, klik tombol, atau captcha.'
  });
}

// Dijalankan di dalam halaman: cek captcha yang terlihat, ambil HTML, tandai tombol lanjut.
function inPage() {
  const visible = e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 20 && r.height > 10 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const capSel = 'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="turnstile"],iframe[src*="challenges.cloudflare"],.g-recaptcha,.h-captcha,.cf-turnstile';
  const cap = [...document.querySelectorAll(capSel)].some(e => {
    const r = e.getBoundingClientRect();
    return visible(e) && r.width > 150 && r.height > 40;
  });
  const words = /^(next|lanjut|lanjutkan|continue|get link|getlink|go to link|download|unlock|skip|verify|open|buka|dapatkan link|klik di sini|click here|i am human|saya manusia|proceed)/i;
  document.querySelectorAll('[data-jayy]').forEach(e => e.removeAttribute('data-jayy'));
  let text = null;
  const els = document.querySelectorAll('a,button,input[type=submit],input[type=button],div[role=button]');
  for (const e of els) {
    const t = (e.innerText || e.value || '').trim();
    if (!t || t.length > 40 || !visible(e) || e.disabled || e.getAttribute('aria-disabled') === 'true') continue;
    if (!words.test(t)) continue;
    if (e.tagName === 'A') {
      const h = e.getAttribute('href') || '';
      let ok = h === '' || h.startsWith('#') || h.startsWith('javascript');
      if (!ok) { try { ok = new URL(h, location.href).hostname === location.hostname; } catch (x) {} }
      if (!ok) continue;
    }
    e.setAttribute('data-jayy', '1');
    text = t;
    break;
  }
  return { cap, html: document.documentElement.outerHTML, text, url: location.href };
}

async function viaBrowser(req, res) {
  let chromium, puppeteer;
  try {
    const c = await import('@sparticuz/chromium');
    chromium = c.default || c;
    const pp = await import('puppeteer-core');
    puppeteer = pp.default || pp;
  } catch (e) {
    return res.status(500).json({ error: 'Paket browser belum terpasang: ' + e.message });
  }
  res.setHeader('Cache-Control', 'no-store');
  let target;
  try { target = new URL((req.query && req.query.url) || ''); }
  catch (e) { return res.status(400).json({ error: 'Link tidak valid' }); }
  if (blocked(target)) return res.status(400).json({ error: 'Alamat ini tidak diizinkan' });

  const found = new Set();
  const chain = [];
  let captcha = false, browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: 'shell',
      defaultViewport: { width: 390, height: 844, isMobile: true }
    });
    const started = Date.now();

    browser.on('targetcreated', async t => {
      try {
        extract(t.url()).forEach(x => found.add(x));
        const p = await t.page();
        if (p && p.url() !== 'about:blank' && p !== page) await p.close();
      } catch (e) {}
    });

    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (['image', 'font', 'media'].includes(r.resourceType())) return r.abort();
      if (r.isNavigationRequest()) extract(r.url()).forEach(x => found.add(x));
      r.continue();
    });

    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    chain.push({ url: target.href, status: 'dibuka' });

    let capCount = 0;
    while (Date.now() - started < LIMIT && !found.size) {
      let st;
      try { st = await page.evaluate(inPage); } catch (e) { await new Promise(r => setTimeout(r, 800)); continue; }

      extract(st.html).forEach(x => found.add(x));
      extract(st.url).forEach(x => found.add(x));
      if (found.size) break;

      capCount = st.cap ? capCount + 1 : 0;
      if (capCount >= 4) { captcha = true; break; }

      if (st.text) {
        try {
          await page.click('[data-jayy="1"]', { delay: 60 });
          chain.push({ url: st.text, status: 'klik tombol' });
        } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    extract(page.url()).forEach(x => found.add(x));
    chain.push({ url: page.url(), status: 'halaman terakhir' });
  } catch (e) {
    return res.status(500).json({ error: 'Browser gagal jalan: ' + e.message });
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }

  const links = [...found];
  return res.status(200).json({
    ok: links.length > 0,
    links,
    chain,
    captcha,
    message: links.length ? 'Link MediaFire ditemukan' :
      captcha ? 'Halaman ini memakai captcha, jadi tidak bisa dilanjutkan otomatis. Selesaikan captcha-nya manual di browser.' :
      'Link MediaFire belum muncul dalam 45 detik. Coba ulangi, atau kirim contoh link-nya supaya langkahnya bisa disesuaikan.'
  });
}

module.exports = async (req, res) => {
  const q = req.query || {};
  if (!q.url) return res.status(400).json({ error: 'Tambahkan ?url=' });
  if (q.mode === 'browser') return viaBrowser(req, res);
  return quick(req, res);
};
