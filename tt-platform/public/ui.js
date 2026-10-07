// Site-styled popups (replace the browser's "this site says" boxes) and shared photo-limit helpers.
(function () {
  var css = '' +
    '.ttModalBack{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:99999;animation:ttFade .15s ease}' +
    '.ttModal{background:var(--card-bg,var(--card,var(--surface,#fff)));color:var(--text,#2a2a2a);border:1px solid var(--border,var(--divider,#e3d6c0));border-radius:16px;max-width:380px;width:100%;padding:22px 22px 18px;box-shadow:0 18px 50px rgba(0,0,0,.35);font-family:inherit;animation:ttPop .18s ease}' +
    '.ttModal h3{font-size:17px;margin:0 0 8px}' +
    '.ttModal p{font-size:14.5px;line-height:1.55;margin:0;white-space:pre-line}' +
    '.ttModalBtns{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}' +
    '.ttModalBtns button{font-family:inherit;font-size:14px;font-weight:600;border-radius:22px;padding:10px 20px;cursor:pointer;border:1px solid transparent}' +
    '.ttBtnOk{background:#e0562f;color:#fff}.ttBtnOk.danger{background:#c0392b}' +
    '.ttBtnCancel{background:transparent;color:var(--text,#2a2a2a);border-color:var(--border,#ccc)!important}' +
    '.ttModalBtns button:hover{filter:brightness(1.08)}' +
    '.ttModalBtns button:focus-visible{outline:2px solid #e0562f;outline-offset:2px}' +
    '@keyframes ttFade{from{opacity:0}to{opacity:1}}@keyframes ttPop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}';
  var styled = false;

  function modal(o) {
    if (!styled) { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); styled = true; }
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'ttModalBack';
      var box = document.createElement('div'); box.className = 'ttModal';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      if (o.title) { var h = document.createElement('h3'); h.textContent = o.title; box.appendChild(h); }
      var p = document.createElement('p'); p.textContent = o.message; box.appendChild(p);
      var btns = document.createElement('div'); btns.className = 'ttModalBtns';
      var prevFocus = document.activeElement;
      function done(v) { document.removeEventListener('keydown', onKey, true); back.remove(); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {} resolve(v); }
      if (o.showCancel) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'ttBtnCancel'; c.textContent = o.cancel || 'Cancel';
        c.addEventListener('click', function () { done(false); }); btns.appendChild(c);
      }
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'ttBtnOk' + (o.danger ? ' danger' : ''); ok.textContent = o.ok || 'OK';
      ok.addEventListener('click', function () { done(true); }); btns.appendChild(ok);
      box.appendChild(btns); back.appendChild(box); document.body.appendChild(back);
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('mousedown', function (e) { if (e.target === back) done(false); });
      ok.focus();
    });
  }

  // await ttConfirm('Remove this photo?', { ok: 'Remove', danger: true })  ->  true / false
  window.ttConfirm = function (message, o) {
    o = o || {};
    return modal({ title: o.title, message: message, ok: o.ok || 'OK', cancel: o.cancel || 'Cancel', danger: o.danger, showCancel: true });
  };
  window.ttAlert = function (message, o) {
    o = o || {};
    return modal({ title: o.title, message: message, ok: o.ok || 'OK', showCancel: false });
  };

  // Photos a business can have in each group (gallery, menu, highlights). Keep in step with PHOTO_LIMIT in server.js.
  window.ttPhotoLimit = function (plan) { return plan === 'premium' ? 20 : 5; };
  window.ttPhotoLimitMsg = function (plan, label) {
    var n = window.ttPhotoLimit(plan);
    return plan === 'premium'
      ? 'You have reached the limit of ' + n + ' ' + label + '.'
      : 'Free business pages can have up to ' + n + ' ' + label + '. Upgrade to Premium to add more.';
  };
})();
