// Page colour picker used in Business Studio and Settings.
// Shows a small button; clicking it opens the full picker with a live preview of the business page.
(function () {
  var SWATCHES = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#d81b60', '#5d4037', '#37474f'];
  var CSS = '' +
    '.bpRoot,.bpBack{--bp-card:var(--card-bg,var(--card,#fff));--bp-border:var(--border,var(--input-border,#e3d6c0));--bp-text:var(--text,#2a2a2a);--bp-muted:var(--text-muted,var(--muted,#777));--bp-soft:var(--soft-bg,#f0e4d0);font-family:inherit}' +
    '.bpOpen{display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin:0;padding:10px 14px;border-radius:12px;background:var(--bp-card);color:var(--bp-text);border:1px solid var(--bp-border);cursor:pointer;font-family:inherit;font-weight:400;font-size:14px}' +
    '.bpOpen:hover{border-color:#e0562f}.bpOpen:focus-visible{outline:2px solid #e0562f;outline-offset:2px}' +
    '.bpOpen b{font-size:14px}.bpSub{font-size:12px;color:var(--bp-muted);text-decoration:underline}' +
    '.bpDot{width:30px;height:30px;border-radius:50%;border:2px solid var(--bp-border);flex-shrink:0}' +
    '.bpBack{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px;z-index:99980}' +
    '.bpBack.open{display:flex}' +
    '.bpModal{background:var(--bp-card);color:var(--bp-text);border-radius:16px;max-width:760px;width:100%;max-height:92vh;overflow-y:auto;padding:20px 22px 18px;position:relative;box-shadow:0 18px 50px rgba(0,0,0,.35)}' +
    '.bpModal h3{font-size:18px;margin:0 0 4px;padding-right:34px}' +
    '.bpModal p{font-size:13px;color:var(--bp-muted);margin:0 0 12px;line-height:1.5}' +
    '.bpClose{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:2px solid var(--bp-text);background:transparent;color:var(--bp-text);cursor:pointer;font-size:14px;font-weight:700;padding:0;margin:0;line-height:1}' +
    '.bpRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
    '.colorWheel{width:38px;height:38px;border-radius:50%;overflow:hidden;cursor:pointer;display:inline-block;position:relative;background:conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff3b30);border:2px solid var(--bp-border);flex-shrink:0}' +
    '.colorWheel input{position:absolute;inset:-8px;width:60px;height:60px;opacity:0;cursor:pointer;border:0;padding:0}' +
    '.colorWheel:focus-within{outline:2px solid #e0562f;outline-offset:2px}' +
    '.bpSw{margin:0;width:26px;height:26px;border-radius:50%;border:2px solid var(--bp-border);cursor:pointer;padding:0}' +
    '.bpSw.sel{outline:2px solid #e0562f;outline-offset:2px}' +
    '.bpReset{margin:0;width:auto;background:var(--bp-soft);color:var(--bp-text);border:none;border-radius:16px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}' +
    '.bpPrev{margin-top:14px;border:1px solid var(--bp-border);border-radius:12px;overflow:hidden;position:relative}' +
    '.bpPrev iframe{border:0;width:1000px;height:760px;transform-origin:0 0;pointer-events:none;background:#fff}' +
    '.bpHint{font-size:12px;color:var(--bp-muted);margin-top:6px}' +
    '.bpDone{margin:14px 0 0;width:100%;padding:12px;border:none;border-radius:12px;background:#e0562f;color:#fff;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit}';

  var cssAdded = false;
  window.ttBrandPicker = function (opts) {
    if (!cssAdded) { var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssAdded = true; }
    var color = '', built = false, back, input, swBox, frame, prev, lastFocus = null;
    var mount = opts.mount;
    mount.classList.add('bpRoot');
    mount.innerHTML = '<button type="button" class="bpOpen" aria-haspopup="dialog"><span class="bpDot"></span><span><b>Page colour</b><br><span class="bpSub">Click here to see full page</span></span></button>';
    var openBtn = mount.querySelector('.bpOpen'), dot = mount.querySelector('.bpDot');

    function shown() { return color || (opts.getSwatch ? opts.getSwatch() : '#23659b'); }
    function paintDot() { dot.style.background = shown(); }
    function paintSwatches() {
      if (!built) return;
      swBox.innerHTML = '';
      SWATCHES.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'bpSw' + (color === c ? ' sel' : ''); b.style.background = c; b.title = c;
        b.setAttribute('aria-label', 'Use colour ' + c);
        b.addEventListener('click', function () { set(c); });
        swBox.appendChild(b);
      });
    }
    function sendToPreview() { if (!built) return; try { frame.contentWindow.postMessage({ ttBrand: color }, location.origin); } catch (e) {} }
    function fit() {
      if (!built) return;
      var w = prev.clientWidth; if (!w) return;
      var scale = Math.min(1, w / 1000);
      frame.style.transform = 'scale(' + scale + ')';
      prev.style.height = Math.round(760 * scale) + 'px';
    }
    function refresh() {
      if (!built) return;
      var d = Object.assign({}, opts.getDraft ? opts.getDraft() : {}, { brandColor: color });
      d.name = d.name || 'Your business name'; d.reviews = d.reviews || [];
      try { localStorage.setItem('ttp_preview_draft', JSON.stringify(d)); }
      catch (e) {
        d.imageUrl = ''; d.photos = []; d.menuPhotos = []; d.highlights = []; d.logoUrl = '';
        try { localStorage.setItem('ttp_preview_draft', JSON.stringify(d)); } catch (e2) { return; }
      }
      fit();
      frame.src = '/biz.html?preview=1&embed=1&t=' + Date.now();
    }
    function set(c) {
      color = /^#[0-9a-fA-F]{6}$/.test(c || '') ? String(c).toLowerCase() : '';
      paintDot();
      if (built) { input.value = shown(); paintSwatches(); sendToPreview(); }
    }
    function build() {
      if (built) return;
      back = document.createElement('div'); back.className = 'bpBack';
      back.innerHTML =
        '<div class="bpModal" role="dialog" aria-modal="true" aria-label="Page colour">' +
        '<button type="button" class="bpClose" aria-label="Close">✕</button>' +
        '<h3>Page colour</h3>' +
        '<p>Make your page your own. Tap the colour wheel or a swatch and the preview changes. Try the colour of your food or your logo.</p>' +
        '<div class="bpRow"><label class="colorWheel" title="Pick any colour"><input type="color" aria-label="Pick a page colour"></label><div class="bpRow bpSwatches" style="gap:7px"></div><button type="button" class="bpReset">Use design colours</button></div>' +
        '<div class="bpPrev"><iframe title="Preview of your page"></iframe></div>' +
        '<div class="bpHint">Remember to save to keep your colour.</div>' +
        '<button type="button" class="bpDone">Done</button></div>';
      back.classList.add('bpRoot');
      document.body.appendChild(back);
      built = true;
      input = back.querySelector('input'); swBox = back.querySelector('.bpSwatches'); frame = back.querySelector('iframe'); prev = back.querySelector('.bpPrev');
      input.addEventListener('input', function () { set(input.value); });
      back.querySelector('.bpReset').addEventListener('click', function () { set(''); });
      back.querySelector('.bpClose').addEventListener('click', close);
      back.querySelector('.bpDone').addEventListener('click', close);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
      frame.addEventListener('load', sendToPreview);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && back.classList.contains('open')) close(); });
      window.addEventListener('resize', fit);
    }
    function open() {
      build();
      lastFocus = document.activeElement;
      input.value = shown(); paintSwatches();
      back.classList.add('open');
      refresh();
      back.querySelector('.bpClose').focus();
    }
    function close() {
      if (!built) return;
      back.classList.remove('open');
      if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
    }
    openBtn.addEventListener('click', open);
    paintDot();
    return {
      get: function () { return color; },
      set: set,
      // The chosen design changed: refresh the button dot and, if open, the preview.
      designChanged: function () { paintDot(); if (built) { input.value = shown(); if (back.classList.contains('open')) refresh(); } }
    };
  };
})();
