// 지름 캘린더 for AmiAmi - background (20261008003)
function toB64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg.type === 'fetchImg') {
    fetch(msg.url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => send({ ok: true, b64: toB64(b) })).catch(e => send({ ok: false, err: String(e) }));
    return true;
  }
  if (msg.type === 'loadExcel') {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, files: ['exceljs.min.js'] })
      .then(() => send({ ok: true })).catch(e => send({ ok: false, err: String(e) }));
    return true;
  }
});
