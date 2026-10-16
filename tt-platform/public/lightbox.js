// Full-screen photo viewer: the photo fills the whole screen, tap/click to zoom in and out, drag to move around.
(function () {
  var css = '' +
    '#ttLB{position:fixed;inset:0;background:#000;display:none;z-index:999990;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}' +
    '#ttLB.show{display:block}' +
    '#ttLB img{position:absolute;left:50%;top:50%;width:100vw;height:100vh;height:100dvh;max-width:none;max-height:none;object-fit:contain;cursor:zoom-in;-webkit-user-drag:none;will-change:transform}' +
    '#ttLB img.zoomed{cursor:grab}#ttLB img.dragging{cursor:grabbing}' +
    '#ttLB .ttX{position:absolute;top:max(12px,env(safe-area-inset-top));right:14px;z-index:2;width:44px;height:44px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.6);color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0}' +
    '#ttLB .ttX:focus-visible{outline:3px solid #f2a33c;outline-offset:2px}' +
    '#ttLB .ttHint{position:absolute;bottom:max(16px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:rgba(0,0,0,.65);color:#fff;font:13px system-ui,sans-serif;padding:6px 14px;border-radius:16px;pointer-events:none;transition:opacity .4s}';
  var box, img, hint, sc = 1, tx = 0, ty = 0, drag = null, moved = false, lastFocus = null, built = false, hintTimer;
  function build() {
    if (built) return; built = true;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'ttLB'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo');
    box.innerHTML = '<button type="button" class="ttX" aria-label="Close photo">✕</button><img alt="" draggable="false"><div class="ttHint">Tap the photo to zoom</div>';
    document.body.appendChild(box);
    img = box.querySelector('img'); hint = box.querySelector('.ttHint');
    box.querySelector('.ttX').addEventListener('click', close);
    img.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty }; moved = false; try { img.setPointerCapture(e.pointerId); } catch (x) {} });
    img.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
      if (sc > 1 && moved) { tx = drag.tx + dx; ty = drag.ty + dy; clamp(); paint(); img.classList.add('dragging'); }
    });
    img.addEventListener('pointerup', function (e) {
      img.classList.remove('dragging');
      var was = drag; drag = null;
      if (!was || moved) return;
      if (sc === 1) zoomTo(2.5, e.clientX, e.clientY); else reset();
    });
    img.addEventListener('pointercancel', function () { drag = null; img.classList.remove('dragging'); });
    box.addEventListener('wheel', function (e) {
      e.preventDefault();
      var next = Math.min(5, Math.max(1, sc * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (next === 1) reset(); else zoomTo(next, e.clientX, e.clientY);
    }, { passive: false });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.classList.contains('show')) close(); });
  }
  function clamp() {
    var w = window.innerWidth, h = window.innerHeight, mx = (sc - 1) * w / 2, my = (sc - 1) * h / 2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  }
  function paint() {
    img.style.transform = 'translate(calc(-50% + ' + tx + 'px), calc(-50% + ' + ty + 'px)) scale(' + sc + ')';
    img.classList.toggle('zoomed', sc > 1);
  }
  function zoomTo(next, cx, cy) {
    // keep the spot that was clicked under the finger
    var px = cx - window.innerWidth / 2, py = cy - window.innerHeight / 2, k = next / sc;
    tx = tx * k - px * (k - 1); ty = ty * k - py * (k - 1); sc = next; clamp(); paint();
  }
  function reset() { sc = 1; tx = 0; ty = 0; paint(); }
  function open(src) {
    build();
    lastFocus = document.activeElement;
    reset(); img.src = src;
    box.classList.add('show'); document.body.style.overflow = 'hidden';
    hint.style.opacity = '1'; clearTimeout(hintTimer); hintTimer = setTimeout(function () { hint.style.opacity = '0'; }, 2500);
    box.querySelector('.ttX').focus();
  }
  function close() {
    if (!built) return;
    box.classList.remove('show'); document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  window.ttLightbox = { open: open, close: close };
})();
