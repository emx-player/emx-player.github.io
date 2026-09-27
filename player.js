/* EMX Player: opens an EMX record (.emx.html) on this device. The file is read here and runs in a
   sandboxed frame with an opaque origin, so a record can reach nothing else on this site, and
   nothing is uploaded anywhere. */
(() => {
  const $ = selector => document.querySelector(selector);
  const picker = $('#picker'), stage = $('#stage'), input = $('#file'), error = $('#error');
  let url = null, frame = null;

  const isRecord = head => /<meta\s+name=["']?emx-record["']?/i.test(head);
  function close() {
    frame?.remove();   // a removed frame stops its sound too
    frame = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
    stage.hidden = true; picker.hidden = false;
    document.title = 'EMX Player';
  }
  async function open(file) {
    error.hidden = true;
    if (!file) return;
    let head;
    try { head = await file.slice(0, 4096).text(); }
    catch { error.textContent = 'This file couldn’t be read. On iPhone, save it to Files first, then open it here.'; error.hidden = false; return; }
    if (!isRecord(head)) { error.textContent = 'This file isn’t an EMX record.'; error.hidden = false; return; }
    close();
    // Re-typed as HTML: a picked file can arrive with no type, and the frame must render it.
    url = URL.createObjectURL(new Blob([file], { type: 'text/html' }));
    // A fresh frame for every record, so nothing carries over. No fullscreen: no record uses it,
    // and a crafted file could take over the screen under this address.
    frame = document.createElement('iframe');
    frame.title = 'EMX record';
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads');
    frame.setAttribute('allow', 'autoplay');
    // The first load is the record. A record never leaves itself, so any later load means the
    // file sent its frame to another page: the player closes it. (A file that redirects while
    // still parsing shows a single load, which this can't tell from a record; the page's
    // frame-src policy refuses that navigation instead.)
    let loads = 0;
    frame.addEventListener('load', () => {
      if (++loads < 2) return;
      close();
      error.textContent = 'This file tried to open another page, so the player closed it.'; error.hidden = false;
      $('#choose').focus();
    });
    frame.src = url;
    stage.prepend(frame);
    picker.hidden = true; stage.hidden = false;
    document.title = `${new DOMParser().parseFromString(head, 'text/html').title || 'EMX record'} · EMX Player`;
    $('#close').focus();
  }

  $('#choose').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { open(input.files[0]); input.value = ''; });
  $('#close').addEventListener('click', () => { close(); $('#choose').focus(); });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('is-dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('is-dragging'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('is-dragging'); open(e.dataTransfer?.files[0]); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
