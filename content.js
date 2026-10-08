// 지름 캘린더 for AmiAmi (20261008003)
(() => {
  if (window.__amsLoaded) return;
  window.__amsLoaded = true;

  const SOON_MONTHS = 3; // 몇 개월 이내 발매를 "곧 발매"로 볼지
  const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const STATUS_KO = { 'Released': '발매중', 'Pre-order': '예약', 'Provisional Pre-order': '가예약', 'Back-order': '입하대기', 'Order Closed': '주문마감' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isWishlist = () => /\/wishlist/.test(location.pathname);
  const fmt = n => n.toLocaleString('ja-JP');
  let running = false;

  // ---------- 수집 ----------
  function scrapePage() {
    const out = [];
    document.querySelectorAll('img[src*="img.amiami.com/images/product"]').forEach(img => {
      if (img.closest('#ams-root')) return;
      let p = img;
      for (let k = 0; k < 6 && p && !/Release Date/.test(p.innerText || ''); k++) p = p.parentElement;
      if (!p || !/Release Date/.test(p.innerText || '')) return;
      const L = p.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const g = k => { const i = L.indexOf(k); return i >= 0 ? (L[i + 1] || '') : ''; };
      const src = img.src.split('?')[0];
      const code = (src.match(/([A-Z]+-\d+(?:-[A-Z0-9]+)?)\.jpg/) || [])[1] || '';
      const priceTxt = g('Unit Price');
      out.push({
        name: L[0].replace(/(\((Pre-order|Provisional Pre-order|Released|Single Shipment|Back-order|Order Closed)\))+$/, '').trim(),
        preowned: /^\(Pre-owned/.test(L[0]),
        date: g('Release Date'),
        price: /JPY/.test(priceTxt) ? parseInt(priceTxt.replace(/[^\d]/g, ''), 10) : null,
        status: g('Sale Status'),
        stock: g('Stock'),
        img: src,
        code
      });
    });
    return out;
  }

  const signature = () => scrapePage().map(i => i.code).join(',');

  function pageLinks() {
    // 북마크 목록 하단 페이지 번호 (ul.pager-list > li.pager-list__item_num)
    return [...document.querySelectorAll('.pager-list .pager-list__item_num')]
      .filter(li => /^\d+$/.test((li.innerText || '').trim()) && !li.closest('#ams-root'));
  }

  function currentPage() {
    const cur = document.querySelector('.pager-list .pager-list__item_current');
    return cur && /^\d+$/.test(cur.innerText.trim()) ? parseInt(cur.innerText.trim(), 10) : 1;
  }

  async function waitList(timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (scrapePage().length) return true;
      await sleep(400);
    }
    return false;
  }

  async function gotoPage(n) {
    const before = signature();
    const link = pageLinks().find(a => a.innerText.trim() === String(n));
    if (!link) return false;
    (link.querySelector('a') || link).click();
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await sleep(300);
      const s = signature();
      if (s && s !== before) { await sleep(300); return true; }
    }
    return false;
  }

  async function collectAll() {
    await waitList();
    const nums = [...new Set(pageLinks().map(a => parseInt(a.innerText.trim(), 10)))].sort((a, b) => a - b);
    const maxPage = nums.length ? Math.max(...nums) : 1;
    const start = currentPage();
    const all = new Map();
    const add = () => scrapePage().forEach(i => all.set(i.code + '|' + i.name, i));
    add();
    for (let n = 1; n <= maxPage; n++) {
      if (n === start) continue;
      setStatus(`수집 중… ${n}/${maxPage} 페이지`);
      if (await gotoPage(n)) add();
    }
    if (maxPage > 1 && currentPage() !== start) await gotoPage(start);
    return [...all.values()];
  }

  // ---------- 정리 ----------
  function parseDate(d) {
    const m = (d || '').match(/(early|mid|late)?\s*([A-Z][a-z]{2})-(\d{4})/);
    if (!m) return { y: 9999, m: 12, sub: 9, label: d || '미정' };
    const sub = { early: 1, mid: 2, late: 3 }[m[1]] || 2;
    const y = +m[3], mo = MON[m[2]];
    return { y, m: mo, sub, label: `${y}-${String(mo).padStart(2, '0')}` + (m[1] ? ` ${({ early: '초', mid: '중', late: '말' })[m[1]]}` : '') };
  }

  function classify(it, now) {
    const pd = parseDate(it.date);
    const diff = (pd.y - now.getFullYear()) * 12 + pd.m - (now.getMonth() + 1);
    const soldOut = /sold out/i.test(it.stock) || /Order Closed/i.test(it.status);
    const released = /^Released/i.test(it.status) || diff < 0;
    const soon = !released && diff <= SOON_MONTHS;
    return { ...it, pd, diff, soldOut, released, soon };
  }

  // ---------- UI ----------
  let root;
  function ensureRoot() {
    if (root && document.body.contains(root)) return root;
    root = document.createElement('div');
    root.id = 'ams-root';
    root.innerHTML = `
      <div class="ams-head"><span class="ams-title">북마크 발매일순</span>
        <button data-a="xlsx" title="이미지 포함 엑셀로 저장">엑셀</button><button data-a="reload">새로고침</button><button data-a="min">접기</button><button data-a="close">✕</button></div>
      <div class="ams-sum"></div>
      <div class="ams-tools">
        <label><input type="checkbox" data-f="hideOut"> 품절 숨기기</label>
        <label><input type="checkbox" data-f="hideRel"> 발매중 숨기기</label>
      </div>
      <div class="ams-body"><div class="ams-msg">불러오는 중…</div></div>`;
    document.body.appendChild(root);
    const pref = load();
    root.querySelectorAll('[data-f]').forEach(cb => { cb.checked = !!pref[cb.dataset.f]; cb.onchange = () => { pref[cb.dataset.f] = cb.checked; save(pref); render(lastData); }; });
    if (pref.min) root.classList.add('ams-min');
    root.querySelector('[data-a="min"]').textContent = pref.min ? '펼치기' : '접기';
    root.querySelector('.ams-head').onclick = e => {
      const a = e.target.dataset.a;
      if (a === 'close') root.remove();
      if (a === 'reload') run(true);
      if (a === 'xlsx') exportExcel(e.target);
      if (a === 'min') { const p = load(); p.min = root.classList.toggle('ams-min'); save(p); e.target.textContent = p.min ? '펼치기' : '접기'; }
    };
    return root;
  }
  function load() { try { return JSON.parse(localStorage.getItem('ams-pref') || '{}'); } catch { return {}; } }
  function save(p) { try { localStorage.setItem('ams-pref', JSON.stringify(p)); } catch {} }
  function setStatus(t) { ensureRoot().querySelector('.ams-body').innerHTML = `<div class="ams-msg">${t}</div>`; }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let lastData = [];

  function render(raw) {
    lastData = raw;
    const r = ensureRoot();
    const now = new Date();
    const pref = load();
    const list = raw.map(i => classify(i, now))
      .sort((a, b) => a.pd.y - b.pd.y || a.pd.m - b.pd.m || a.pd.sub - b.pd.sub || (a.price || 0) - (b.price || 0));

    const avail = list.filter(i => !i.soldOut);
    const sum = arr => arr.reduce((s, i) => s + (i.price || 0), 0);
    const rel = avail.filter(i => i.released), soon = avail.filter(i => i.soon);
    r.querySelector('.ams-title').textContent = `북마크 발매일순 (${list.length})`;
    r.querySelector('.ams-sum').innerHTML = `
      <div><span>지금 구매 가능 (${rel.length})</span><b>${fmt(sum(rel))}엔</b></div>
      <div><span>${SOON_MONTHS}개월 내 발매 (${soon.length})</span><b>${fmt(sum(soon))}엔</b></div>
      <div><span>전체 (품절 ${list.length - avail.length} 제외)</span><b>${fmt(sum(avail))}엔</b></div>`;

    const shown = list.filter(i => !(pref.hideOut && i.soldOut) && !(pref.hideRel && i.released));
    let html = '', lastMonth = '';
    shown.forEach(i => {
      const mk = i.pd.y === 9999 ? '발매일 미정' : `${i.pd.y}년 ${i.pd.m}월`;
      if (mk !== lastMonth) { html += `<div class="ams-month">${mk}</div>`; lastMonth = mk; }
      const cls = i.soldOut ? 'out' : i.released ? 'rel' : i.soon ? 'soon' : '';
      const when = i.released ? '<span class="ams-tag g">발매됨</span>'
        : i.diff === 0 ? '<span class="ams-tag o">이번 달</span>'
        : `<span class="ams-tag ${i.soon ? 'o' : ''}">${i.diff}개월 후</span>`;
      const url = `https://www.amiami.com/eng/detail/?gcode=${encodeURIComponent(i.code)}`;
      html += `<div class="ams-row ${cls}">
        <img src="${esc(i.img)}" loading="lazy">
        <div class="ams-info">
          <a class="ams-name" href="${url}" target="_blank" title="${esc(i.name)}">${esc(i.name)}</a>
          <div class="ams-meta"><span>${esc(i.pd.label)}</span>${when}
            <span class="ams-tag">${esc(STATUS_KO[i.status] || i.status)}</span>
            ${i.soldOut ? '<span class="ams-tag x">품절</span>' : ''}${i.preowned ? '<span class="ams-tag">중고</span>' : ''}</div>
        </div>
        <div class="ams-price">${i.price ? fmt(i.price) + '엔' : '-'}</div></div>`;
    });
    r.querySelector('.ams-body').innerHTML = html || '<div class="ams-msg">표시할 항목이 없어요</div>';
  }

  // ---------- 엑셀 내보내기 ----------
  const send = m => new Promise(res => { try { chrome.runtime.sendMessage(m, r => res(r || { ok: false })); } catch (e) { res({ ok: false, err: String(e) }); } });
  const ymd = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  async function exportExcel(btn) {
    if (!lastData.length || btn.disabled) return;
    const label = btn.textContent; btn.disabled = true;
    try {
      btn.textContent = '준비 중…';
      if (!window.ExcelJS) { const r = await send({ type: 'loadExcel' }); if (!r.ok || !window.ExcelJS) throw new Error('ExcelJS 로드 실패 ' + (r.err || '')); }
      const now = new Date();
      const list = lastData.map(i => classify(i, now))
        .sort((a, b) => a.pd.y - b.pd.y || a.pd.m - b.pd.m || a.pd.sub - b.pd.sub || (a.price || 0) - (b.price || 0));

      const imgs = {}; let done = 0; const q = [...list];
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (q.length) {
          const i = q.shift();
          const r = await send({ type: 'fetchImg', url: i.img });
          if (r.ok) imgs[i.img] = r.b64;
          btn.textContent = `이미지 ${++done}/${list.length}`;
        }
      }));
      btn.textContent = '생성 중…';

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('북마크_발매일순', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [
        { header: 'No', width: 5 }, { header: '이미지', width: 15 }, { header: '발매일', width: 12 }, { header: '상품명', width: 58 },
        { header: '가격(JPY)', width: 11 }, { header: '판매상태', width: 10 }, { header: '재고', width: 9 }, { header: '남은 기간', width: 10 }, { header: '링크', width: 7 }
      ];
      const line = { style: 'thin', color: { argb: 'FFBFBFBF' } };
      const border = { top: line, bottom: line, left: line, right: line };
      ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF305496' } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = border; });
      ws.getRow(1).height = 20;

      list.forEach((i, n) => {
        const url = `https://www.amiami.com/eng/detail/?gcode=${encodeURIComponent(i.code)}`;
        const row = ws.addRow([n + 1, '', i.pd.label, i.name, i.price, STATUS_KO[i.status] || i.status,
          i.soldOut ? '품절' : '재고있음', i.released ? '발매됨' : `${i.diff}개월`, { text: '열기', hyperlink: url }]);
        row.height = 72;
        const color = i.soldOut ? 'FFD9D9D9' : i.released ? 'FFE2EFDA' : i.soon ? 'FFFCE4D6' : null;
        row.eachCell({ includeEmpty: true }, (c, col) => {
          c.border = border;
          c.alignment = { vertical: 'middle', horizontal: col === 4 ? 'left' : 'center', wrapText: col === 4 };
          if (color) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        });
        row.getCell(5).numFmt = '#,##0';
        row.getCell(9).font = { color: { argb: 'FF0563C1' }, underline: true };
        if (imgs[i.img]) {
          const id = wb.addImage({ base64: imgs[i.img], extension: 'jpeg' });
          ws.addImage(id, { tl: { col: 1.08, row: row.number - 1 + 0.04 }, ext: { width: 92, height: 92 } });
        }
      });
      const last = list.length + 1;
      ws.autoFilter = { from: 'A1', to: `I${last}` };
      ws.addRow([]);
      [['합계 (품절 제외)', `SUMIFS(E2:E${last},G2:G${last},"재고있음")`],
       ['지금 구매 가능', `SUMIFS(E2:E${last},G2:G${last},"재고있음",H2:H${last},"발매됨")`]].forEach(([l, f]) => {
        const row = ws.addRow(['', '', '', l, { formula: f }]);
        row.getCell(4).font = { bold: true }; row.getCell(4).alignment = { horizontal: 'right' };
        row.getCell(5).numFmt = '#,##0'; row.getCell(5).font = { bold: true };
      });
      ws.addRow([]);
      ws.addRow(['', '', '', `색: 초록=발매됨 / 주황=${SOON_MONTHS}개월 내 발매 / 회색=품절 · ${ymd()} 기준`]);

      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `AmiAmi_북마크_발매일순_${ymd()}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      alert('엑셀 내보내기 실패: ' + e.message);
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  async function run(force) {
    if (running || !isWishlist()) return;
    running = true;
    try {
      ensureRoot();
      setStatus('수집 중…');
      const data = await collectAll();
      if (!data.length) setStatus('북마크 목록을 찾지 못했어요 (로그인 상태 확인)');
      else render(data);
    } catch (e) {
      setStatus('오류: ' + esc(e.message));
    } finally { running = false; }
  }

  // SPA 페이지 이동 감지
  let lastPath = '';
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    if (isWishlist()) run();
    else if (root) { root.remove(); root = null; }
  }, 800);
})();
