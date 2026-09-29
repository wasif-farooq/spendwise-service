#!/usr/bin/env node
/**
 * Renders the synthetic receipt photos in tests/fixtures/receipts/ from HTML,
 * with headless Chrome over the DevTools protocol (no extra dependencies).
 *
 *   node scripts/receipts/render-receipt-fixtures.mjs [--chrome /path/to/chrome]
 *
 * Every business here is fictional. expected.json holds the ground truth that
 * scripts/eval-receipt-scan.mjs scores the scanner against.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'tests', 'fixtures', 'receipts');
const chromeArg = process.argv.indexOf('--chrome');
const chrome = chromeArg > -1 ? process.argv[chromeArg + 1] : 'google-chrome';

// ---------------------------------------------------------------- templates

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const row = (l, r, cls = '') => `<div class="row ${cls}"><span>${esc(l)}</span><span>${esc(r)}</span></div>`;
const items = (list, fmt) => list.map(([d, a]) => row(d, fmt(a))).join('');
const usd = (n) => n.toFixed(2);
const eur = (n) => n.toFixed(2).replace('.', ',');

/** A photographed paper receipt on a surface. */
const page = ({ font, size = 22, width = 560, body, surface = '#6b5a4a', tilt = 0, filter = 'none', paper = '#fbfaf6', ink = '#1d1d1d', extraCss = '' }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:${width + 240}px;background:${surface};background-image:
    radial-gradient(circle at 20% 30%, rgba(255,255,255,.08), transparent 40%),
    repeating-linear-gradient(90deg, rgba(0,0,0,.04) 0 3px, transparent 3px 11px);
    padding:60px 0 80px;display:flex;justify-content:center}
  #photo{display:inline-block}
  .receipt{width:${width}px;background:${paper};color:${ink};font-family:${font};font-size:${size}px;line-height:1.35;
    padding:34px 30px 46px;box-shadow:0 18px 40px rgba(0,0,0,.45);transform:rotate(${tilt}deg);filter:${filter};
    -webkit-mask-image:linear-gradient(#000,#000);letter-spacing:.02em}
  .c{text-align:center}.b{font-weight:bold}.big{font-size:1.45em}.sm{font-size:.82em}
  .row{display:flex;justify-content:space-between;gap:16px}
  .rule{border-top:2px dashed currentColor;margin:10px 0;opacity:.7}
  .total{font-weight:bold;font-size:1.2em}
  ${extraCss}
</style></head><body><div id="photo"><div class="receipt">${body}</div></div></body></html>`;

const thermal = "'DejaVu Sans Mono', 'Courier New', monospace";

const RECEIPTS = [
  {
    id: '01-grocery-us',
    note: 'US supermarket, thermal print, MM/DD/YYYY',
    expected: { total: 47.83, currency: 'USD', date: '2026-09-14', merchant: 'FreshMart', category: ['Food & Dining', 'Groceries'] },
    html: page({
      font: thermal,
      body: `<div class="c b big">FRESHMART</div><div class="c sm">1420 Maple Ave, Springfield IL<br>(217) 555-0142</div><div class="rule"></div>
      <div class="sm">09/14/2026 18:42  REG 04  #58213</div><div class="rule"></div>
      ${items([['BANANAS 2.1LB', 1.24], ['WHOLE MILK 1GAL', 3.99], ['EGGS LARGE 12CT', 4.29], ['SOURDOUGH BREAD', 5.49], ['CHICKEN BREAST', 11.87], ['BABY SPINACH', 3.99], ['CHEDDAR 8OZ', 4.79], ['OLIVE OIL 500ML', 8.99]], usd)}
      <div class="rule"></div>${row('SUBTOTAL', '44.65')}${row('TAX 7.125%', '3.18')}${row('TOTAL', '47.83', 'total')}
      ${row('VISA **** 4417', '47.83')}<div class="rule"></div><div class="c sm">THANK YOU FOR SHOPPING AT FRESHMART</div>`,
    }),
  },
  {
    id: '02-restaurant-tip-us',
    note: 'Restaurant card slip with a handwritten tip and total',
    expected: { total: 79.12, currency: 'USD', date: '2026-09-05', merchant: 'The Olive Table', category: ['Food & Dining'] },
    html: page({
      font: "'Liberation Serif', 'Times New Roman', serif",
      size: 23,
      surface: '#2f3b45',
      tilt: -1.5,
      extraCss: `.hand{font-family:'URW Chancery L','Z003','Comic Sans MS',cursive;color:#1a3a8a;font-size:1.5em;font-weight:bold}`,
      body: `<div class="c b big">The Olive Table</div><div class="c sm">Mediterranean Kitchen · 88 Harbor St, Portland ME</div><div class="rule"></div>
      <div class="sm">Server: Dana &nbsp; Table 12 &nbsp; Guests 2</div><div class="sm">Date: 09/05/2026 &nbsp; 8:17 PM</div><div class="rule"></div>
      ${items([['Mezze Platter', 14.0], ['Lamb Kofta', 24.0], ['Grilled Halloumi Salad', 16.0], ['Baklava', 8.0]], usd)}
      <div class="rule"></div>${row('Subtotal', '62.00')}${row('Tax', '5.12')}${row('Amount', '67.12', 'b')}
      <div class="row" style="margin-top:18px"><span>Tip:</span><span class="hand">12.00</span></div>
      <div class="row" style="margin-top:8px"><span class="b">Total:</span><span class="hand">79.12</span></div>
      <div class="rule"></div><div class="sm">MASTERCARD **** 2231 &nbsp; AUTH 004417</div><div class="c sm">Signature ______________________</div>`,
    }),
  },
  {
    id: '03-fuel-us',
    note: 'Fuel pump receipt, narrow thermal',
    expected: { total: 58.4, currency: 'USD', date: '2026-08-30', merchant: 'Northside Fuel', category: ['Transportation'] },
    html: page({
      font: thermal,
      width: 440,
      size: 21,
      surface: '#444',
      body: `<div class="c b big">NORTHSIDE FUEL #214</div><div class="c sm">3301 Route 9 North<br>Albany NY 12204</div><div class="rule"></div>
      <div>DATE 08/30/2026</div><div>TIME 07:58:12</div><div>PUMP # 06</div><div class="rule"></div>
      ${row('REGULAR UNL', '')}${row('GALLONS', '15.412')}${row('PRICE/GAL', '$3.789')}<div class="rule"></div>
      ${row('FUEL TOTAL', '$58.40', 'total')}${row('DEBIT **** 9012', '$58.40')}<div class="rule"></div><div class="c sm">NO RECEIPT? NO PROBLEM - ASK INSIDE</div>`,
    }),
  },
  {
    id: '04-pharmacy-us',
    note: 'Pharmacy with a prescription copay and sundries',
    expected: { total: 23.17, currency: 'USD', date: '2026-09-02', merchant: 'CareWell Pharmacy', category: ['Health & Fitness', 'Health'] },
    html: page({
      font: "'Liberation Sans', Arial, sans-serif",
      surface: '#8a8f94',
      tilt: 1,
      body: `<div class="c b big">CareWell Pharmacy</div><div class="c sm">Store 1187 · 55 Elm Street, Dayton OH</div><div class="rule"></div>
      <div class="sm">09/02/2026 &nbsp; 10:04 AM &nbsp; TRN 7781</div><div class="rule"></div>
      ${items([['RX COPAY #4471923', 10.0], ['IBUPROFEN 200MG 100CT', 7.49], ['BANDAGES ASST 30CT', 4.29]], usd)}
      <div class="rule"></div>${row('SUBTOTAL', '21.78')}${row('TAX', '1.39')}${row('TOTAL', '23.17', 'total')}${row('CASH', '30.00')}${row('CHANGE', '6.83')}
      <div class="rule"></div><div class="c sm">Questions about your prescription?<br>Call 937-555-0117</div>`,
    }),
  },
  {
    id: '05-cafe-eur-fr',
    note: 'Paris café, EUR with decimal commas, DD/MM/YYYY',
    expected: { total: 12.4, currency: 'EUR', date: '2026-09-18', merchant: 'Café Lumière', category: ['Food & Dining'] },
    html: page({
      font: "'DejaVu Serif', Georgia, serif",
      width: 480,
      surface: '#5d4636',
      body: `<div class="c b big">Café Lumière</div><div class="c sm">12 rue des Martyrs, 75009 Paris<br>SIRET 812 345 678 00019</div><div class="rule"></div>
      <div class="sm">18/09/2026 &nbsp; 09:26 &nbsp; Table 5</div><div class="rule"></div>
      ${items([['2 x Café crème', 7.0], ['1 x Croissant', 2.2], ['1 x Jus d\'orange', 3.2]], (n) => `${eur(n)} €`)}
      <div class="rule"></div>${row('Total HT', '10,33 €')}${row('TVA 10%', '1,03 €')}${row('TVA 5,5%', '1,04 €')}${row('TOTAL TTC', '12,40 €', 'total')}
      ${row('CB', '12,40 €')}<div class="rule"></div><div class="c sm">Merci de votre visite !</div>`,
    }),
  },
  {
    id: '06-supermarket-eur-de',
    note: 'German supermarket, SUMME, DD.MM.YYYY',
    expected: { total: 34.56, currency: 'EUR', date: '2026-09-03', merchant: 'Frischmarkt', category: ['Food & Dining', 'Groceries'] },
    html: page({
      font: "'Liberation Mono', monospace",
      size: 21,
      surface: '#3d4a3d',
      tilt: -0.8,
      body: `<div class="c b big">FRISCHMARKT</div><div class="c sm">Frischmarkt GmbH · Bergstr. 21 · 50667 Köln</div><div class="rule"></div>
      ${items([['Vollmilch 3,5%', 1.19], ['Bio Eier 10 St.', 3.49], ['Roggenbrot', 2.79], ['Gouda Scheiben', 2.69], ['Äpfel Elstar 1kg', 2.99], ['Kaffee Bohnen 1kg', 12.99], ['Mineralwasser 6x1,5l', 3.54], ['Butter 250g', 2.39], ['Tomaten', 2.49]], (n) => `${eur(n)} A`)}
      <div class="rule"></div>${row('SUMME EUR', '34,56', 'total')}${row('Geg. EC-Karte', '34,56')}<div class="rule"></div>
      <div class="sm">MwSt 7% Netto 32,30 MwSt 2,26</div><div class="sm">03.09.2026 &nbsp; 17:31 &nbsp; Bon 4812 &nbsp; Kasse 2</div><div class="c sm">Vielen Dank für Ihren Einkauf!</div>`,
    }),
  },
  {
    id: '07-pub-gbp',
    note: 'UK pub, £, DD/MM/YYYY',
    expected: { total: 28.5, currency: 'GBP', date: '2026-09-21', merchant: 'The Crown & Anchor', category: ['Food & Dining'] },
    html: page({
      font: thermal,
      width: 480,
      surface: '#3b2a22',
      body: `<div class="c b big">THE CROWN &amp; ANCHOR</div><div class="c sm">4 Quay Street, Bristol BS1 4DB<br>VAT No. GB 123 4567 89</div><div class="rule"></div>
      <div>21/09/2026 &nbsp; 20:05 &nbsp; TBL 7</div><div class="rule"></div>
      ${items([['2 PINT BITTER', 10.4], ['FISH & CHIPS', 14.5], ['STICKY TOFFEE PUD', 3.6]], (n) => `£${usd(n)}`)}
      <div class="rule"></div>${row('TOTAL', '£28.50', 'total')}${row('CONTACTLESS', '£28.50')}${row('VAT 20% INCL', '£4.75')}<div class="rule"></div><div class="c sm">CHEERS!</div>`,
    }),
  },
  {
    id: '08-bookshop-gbp',
    note: 'UK bookshop, printed invoice style',
    expected: { total: 17.98, currency: 'GBP', date: '2026-08-11', merchant: 'Harbour Books', category: ['Shopping', 'Education', 'Entertainment'] },
    html: page({
      font: "'Carlito', 'Calibri', sans-serif",
      size: 24,
      surface: '#9a9a8f',
      tilt: 2,
      body: `<div class="c b big">Harbour Books</div><div class="c sm">Independent booksellers since 1974 · St Ives, Cornwall</div><div class="rule"></div>
      <div class="sm">Sale 000412 · 11/08/2026 · 14:22</div><div class="rule"></div>
      ${items([['The Tidal Year (pb)', 9.99], ['Field Guide to Seabirds', 7.99]], (n) => `£${usd(n)}`)}
      <div class="rule"></div>${row('Total', '£17.98', 'total')}${row('Paid by card', '£17.98')}<div class="rule"></div><div class="c sm">Books are zero-rated for VAT</div>`,
    }),
  },
  (() => {
    const list = [
      ['APPLES GALA', 4.18], ['AVOCADO 4CT', 5.0], ['BLUEBERRIES', 4.99], ['CARROTS 2LB', 1.89], ['CELERY', 1.99], ['ONIONS 3LB', 3.49], ['POTATOES 5LB', 4.99], ['LEMONS', 2.5],
      ['GREEK YOGURT', 5.49], ['BUTTER', 4.29], ['MOZZARELLA', 3.99], ['CREAM CHEESE', 2.79], ['ORANGE JUICE', 4.49], ['OAT MILK', 3.99], ['GROUND BEEF 2LB', 11.98], ['SALMON FILLET', 13.47],
      ['PASTA PENNE', 1.79], ['PASTA SAUCE', 3.49], ['RICE JASMINE 5LB', 7.99], ['BLACK BEANS', 1.29], ['CHICKPEAS', 1.29], ['TORTILLAS', 3.29], ['PEANUT BUTTER', 3.99], ['JAM STRAWBERRY', 3.49],
      ['CEREAL OATS', 4.29], ['GRANOLA', 5.99], ['COFFEE GROUND', 9.99], ['TEA GREEN', 3.79], ['DARK CHOCOLATE', 2.99], ['CRACKERS', 3.49], ['TORTILLA CHIPS', 3.99], ['SALSA', 3.29],
      ['PAPER TOWELS', 8.99], ['DISH SOAP', 3.49], ['TRASH BAGS', 7.99], ['LAUNDRY DET', 11.99], ['SPONGES', 2.49], ['FOIL', 4.29], ['FROZEN PEAS', 1.99], ['ICE CREAM', 5.26],
    ];
    const sub = +list.reduce((s, [, a]) => s + a, 0).toFixed(2);
    const tax = +(sub * 0.06).toFixed(2);
    const total = +(sub + tax).toFixed(2);
    return {
      id: '09-long-grocery-us',
      note: 'Long receipt: 40 lines, the total at the very bottom',
      expected: { total, currency: 'USD', date: '2026-09-10', merchant: 'Valley Foods', category: ['Food & Dining', 'Groceries'] },
      html: page({
        font: thermal,
        size: 20,
        width: 470,
        surface: '#555',
        body: `<div class="c b big">VALLEY FOODS</div><div class="c sm">Store 031 · 900 Canyon Rd, Boise ID</div><div class="rule"></div>
        <div class="sm">09/10/2026 &nbsp; 19:12 &nbsp; LANE 3</div><div class="rule"></div>
        ${items(list, usd)}<div class="rule"></div>${row('SUBTOTAL', usd(sub))}${row('TAX 6%', usd(tax))}${row('TOTAL', usd(total), 'total')}
        ${row('CREDIT **** 7781', usd(total))}${row('ITEMS SOLD', String(list.length))}<div class="rule"></div><div class="c sm">YOU SAVED $12.40 TODAY</div>`,
      }),
    };
  })(),
  {
    id: '10-faded-thermal-us',
    note: 'Faded thermal paper: low contrast, grey ink',
    expected: { total: 9.87, currency: 'USD', date: '2026-09-25', merchant: 'Quick Stop Market', category: ['Food & Dining', 'Groceries'] },
    html: page({
      font: thermal,
      width: 440,
      paper: '#f2efe6',
      ink: '#9d9a93',
      surface: '#6d6d6d',
      filter: 'contrast(.75) brightness(1.05)',
      body: `<div class="c b big">QUICK STOP MARKET</div><div class="c sm">77 Depot St, Burlington VT</div><div class="rule"></div>
      <div>09/25/2026 &nbsp; 06:48</div><div class="rule"></div>
      ${items([['COFFEE 20OZ', 2.49], ['BAGEL W/CC', 3.29], ['BANANA', 0.59], ['WATER 1L', 2.99]], usd)}
      <div class="rule"></div>${row('SUBTOTAL', '9.36')}${row('TAX', '0.51')}${row('TOTAL', '9.87', 'total')}${row('CASH', '10.00')}${row('CHANGE', '0.13')}`,
    }),
  },
  {
    id: '11-tilted-blurred-us',
    note: 'Photo taken at an angle: 7° tilt and a slight blur',
    expected: { total: 64.29, currency: 'USD', date: '2026-09-19', merchant: 'Oak & Iron Hardware', category: ['Home & Garden'] },
    html: page({
      font: "'Liberation Sans', Arial, sans-serif",
      surface: '#7b6a55',
      tilt: 7,
      filter: 'blur(0.7px)',
      body: `<div class="c b big">OAK &amp; IRON HARDWARE</div><div class="c sm">212 Mill Road, Asheville NC</div><div class="rule"></div>
      <div class="sm">Date: 09/19/2026 &nbsp; Time: 11:36</div><div class="rule"></div>
      ${items([['Deck screws 5lb', 24.99], ['Wood stain qt', 18.49], ['Brush set', 9.99], ['Sandpaper assort.', 6.99]], usd)}
      <div class="rule"></div>${row('Subtotal', '60.46')}${row('Sales tax 7%', '3.83')}${row('TOTAL', '$64.29', 'total')}${row('VISA', '$64.29')}`,
    }),
  },
  {
    id: '12-not-a-receipt',
    note: 'A landscape picture, not a receipt',
    expected: { error: 'NOT_A_RECEIPT' },
    html: `<!doctype html><html><head><style>
      html,body{margin:0}
      #photo{width:800px;height:560px;position:relative;overflow:hidden;background:linear-gradient(#7ab8e8,#f7d9a8 70%)}
      .sun{position:absolute;left:560px;top:90px;width:110px;height:110px;border-radius:50%;background:#fff3b0;box-shadow:0 0 60px #ffe680}
      .m1{position:absolute;bottom:120px;left:-60px;border-left:320px solid transparent;border-right:320px solid transparent;border-bottom:300px solid #5b6b7d}
      .m2{position:absolute;bottom:120px;left:300px;border-left:280px solid transparent;border-right:280px solid transparent;border-bottom:240px solid #718296}
      .lake{position:absolute;bottom:0;width:100%;height:120px;background:linear-gradient(#4f86b0,#2d5a80)}
      .tree{position:absolute;bottom:110px;width:0;height:0;border-left:22px solid transparent;border-right:22px solid transparent;border-bottom:90px solid #234d2c}
    </style></head><body><div id="photo"><div class="sun"></div><div class="m1"></div><div class="m2"></div>
      <div class="tree" style="left:60px"></div><div class="tree" style="left:110px;border-bottom-width:120px"></div><div class="tree" style="left:690px"></div>
      <div class="lake"></div></div></body></html>`,
  },
];

// ------------------------------------------------------------------ chrome

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withChrome(fn) {
  const profile = mkdtempSync(join(tmpdir(), 'receipt-render-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  try {
    let version;
    for (let i = 0; i < 50 && !version; i++) {
      await sleep(200);
      version = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null);
    }
    const target = version.find((t) => t.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) events.push(msg);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    await fn(send, events);
    ws.close();
  } finally {
    proc.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

await withChrome(async (send) => {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 3000, deviceScaleFactor: 1, mobile: false });
  const expected = {};
  for (const r of RECEIPTS) {
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(r.html).toString('base64')}` });
    await sleep(600);
    // Crop to the paper plus a margin of surface (or to the picture itself).
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => { const p = document.getElementById('photo').getBoundingClientRect(); const b = document.body.getBoundingClientRect(); const bare = !document.querySelector('.receipt'); return JSON.stringify(bare ? { w: p.right, h: p.bottom } : { w: b.width, h: p.bottom + 60 }); })()`,
      returnByValue: true,
    });
    const { w, h } = JSON.parse(result.value);
    await send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    const shot = await send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 72,
      clip: { x: 0, y: 0, width: Math.ceil(w), height: Math.ceil(h), scale: 1 },
      captureBeyondViewport: true,
    });
    const file = `${r.id}.jpg`;
    writeFileSync(join(outDir, file), Buffer.from(shot.data, 'base64'));
    expected[r.id] = { file, note: r.note, ...r.expected };
    console.log(`${file}  ${Math.ceil(w)}x${Math.ceil(h)}  ${Math.round(Buffer.from(shot.data, 'base64').length / 1024)} KB`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 3000, deviceScaleFactor: 1, mobile: false });
  }
  writeFileSync(join(outDir, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
});
