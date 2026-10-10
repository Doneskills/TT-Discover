// Shared Premium popup + the small "Premium" button that sits beside the dark-mode toggle.
// Loaded on site pages (home, Business Studio, settings, profile, legal pages) but not on business pages.
(function () {
  var CSS = '  #premiumPopup {\n    --pp-bg: var(--card-bg, var(--card, #fff)); --pp-soft: var(--soft-bg, #f1e9dc); --pp-muted: var(--text-muted, var(--muted, #777)); --pp-text: var(--text, #2a2a2a); color: var(--pp-text);\n    font-family: \'Segoe UI\', system-ui, sans-serif;\n    position: fixed; inset: 0; background: rgba(0,0,0,0.5);\n    display: none; align-items: center; justify-content: center; z-index: 99990; padding: 16px;\n  }\n  #premiumPopup.open { display: flex; }\n  #premiumPopupPanel {\n    background: var(--pp-bg); border-radius: 18px; max-width: 860px; width: 100%;\n    max-height: 88vh; overflow: hidden; position: relative;\n    display: grid; grid-template-columns: 320px 1fr;\n  }\n  #premiumPopupClose {\n    position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 50%;\n    border: 2px solid #1a1a1a; background: transparent; color: #1a1a1a; font-size: 16px; font-weight: 700;\n    cursor: pointer; z-index: 2; line-height: 1; padding: 0;\n  }\n  [data-theme="dark"] #premiumPopupClose { border-color: var(--pp-text); color: var(--pp-text); }\n  .ppLeft {\n    background: #ff7420; color: #111; padding: 34px 22px; position: relative; overflow: hidden;\n  }\n  .ppLeft::before {\n    content: \'\'; position: absolute; top: -90px; left: -90px; width: 260px; height: 260px; border-radius: 50%;\n    background: linear-gradient(135deg, rgba(150,110,10,.85), rgba(255,170,40,.55)); pointer-events: none;\n  }\n  .ppLeft > * { position: relative; }\n  .ppLeft h2 { font-size: 26px; font-weight: 400; line-height: 1.2; margin: 0 0 26px; padding: 0; }\n  .ppPlan {\n    display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; cursor: pointer;\n    margin: 0 0 14px; padding: 12px 18px; border-radius: 999px; border: 2px solid #111;\n    background: #c9733f; color: #111; font-family: inherit;\n  }\n  .ppPlan:hover { filter: brightness(1.06); }\n  .ppPlan:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }\n  .ppDot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #111; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }\n  .ppPlan.sel .ppDot { background: #fff; }\n  .ppPlan.sel .ppDot::after { content: \'\'; width: 9px; height: 9px; border-radius: 50%; border: 2px solid #111; box-sizing: border-box; }\n  .ppPlan b { display: block; font-size: 17px; }\n  .ppPlan span.pr { font-size: 13px; }\n  .ppRight { padding: 34px 40px 28px 34px; overflow-y: auto; display: flex; flex-direction: column; }\n  .ppRight h3 { font-size: 21px; margin: 0 0 4px; padding-right: 40px; }\n  .ppTag { font-size: 14px; color: var(--pp-muted); margin-bottom: 14px; }\n  .ppFeat { list-style: none; padding: 0; margin: 0 0 10px; }\n  .ppFeat li { font-size: 14.5px; line-height: 1.45; padding: 5px 0 5px 26px; position: relative; }\n  .ppFeat li::before { content: \'✓\'; position: absolute; left: 2px; color: #e0562f; font-weight: 700; }\n  .ppFeat li.head { padding-left: 0; font-weight: 700; margin-top: 10px; color: var(--pp-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }\n  .ppFeat li.head::before { content: none; }\n  .ppAction { margin-top: auto; padding-top: 12px; position: sticky; bottom: -28px; background: var(--pp-bg); padding-bottom: 28px; box-shadow: 0 -10px 12px -6px var(--pp-bg); }\n  .ppAction button { width: 100%; padding: 13px; border-radius: 12px; border: none; background: #e0562f; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; font-family: inherit; }\n  .ppAction button.free { background: var(--pp-soft); color: var(--pp-text); }\n  .ppFine { font-size: 12px; color: var(--pp-muted); margin-top: 10px; line-height: 1.5; }\n  @media (max-width: 700px) {\n    #premiumPopupPanel { grid-template-columns: 1fr; overflow-y: auto; }\n    .ppLeft { padding: 24px 18px 8px; }\n    .ppLeft::before { width: 200px; height: 200px; top: -90px; left: -90px; }\n    .ppLeft h2 { font-size: 22px; margin-bottom: 18px; padding-right: 44px; }\n    .ppPlan { margin-bottom: 10px; padding: 10px 16px; }\n    .ppRight { padding: 20px 20px 24px; overflow: visible; }\n    .ppAction { position: static; box-shadow: none; padding-bottom: 0; }\n    #premiumPopupClose { border-color: #111; color: #111; }\n  }\n\n';
  var BTN_CSS = "\n  .ttPremiumBtn {\n    font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; font-weight: 700; line-height: 1;\n    padding: 6px 12px; border-radius: 999px; border: 1px solid #e0562f; background: #fff; color: #e0562f;\n    cursor: pointer; white-space: nowrap; margin: 0; width: auto;\n  }\n  .ttPremiumBtn:hover { background: #fff3ea; }\n  .ttPremiumBtn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 4px #e0562f; }\n  @media (max-width: 480px) { .ttPremiumBtn { font-size: 11px; padding: 5px 9px; } }\n  .ttPremiumBtn.floating { position: fixed; top: 12px; right: 12px; z-index: 9990; box-shadow: 0 2px 8px rgba(0,0,0,.2); }\n";
  var MARKUP = '<div id="premiumPopup">\n  <div id="premiumPopupPanel" role="dialog" aria-modal="true" aria-labelledby="ppTitle">\n    <button id="premiumPopupClose" type="button" aria-label="Close">✕</button>\n    <div class="ppLeft">\n      <h2 id="ppTitle">Try TT Discover for free</h2>\n      <div role="radiogroup" aria-label="Choose a plan">\n        <button type="button" class="ppPlan" role="radio" data-plan="free"><span class="ppDot"></span><span><b>Free</b><span class="pr">TT$0/month</span></span></button>\n        <button type="button" class="ppPlan" role="radio" data-plan="basic"><span class="ppDot"></span><span><b>Basic</b><span class="pr">TT$75/month</span></span></button>\n        <button type="button" class="ppPlan" role="radio" data-plan="pro"><span class="ppDot"></span><span><b>Pro</b><span class="pr">TT$150/month</span></span></button>\n      </div>\n    </div>\n    <div class="ppRight">\n      <h3 id="ppName"></h3>\n      <div class="ppTag" id="ppTag"></div>\n      <ul class="ppFeat" id="ppFeat"></ul>\n      <div class="ppAction">\n        <button type="button" id="ppCta"></button>\n        <div class="ppFine" id="premiumMsg" role="status"></div>\n        <div class="ppFine">Plans and limits may change before launch.</div>\n      </div>\n    </div>\n  </div>\n</div>';
  var built = false, lastFocus = null;

const PP_PLANS = {
  free: {
    name: 'Free', tag: 'Get discovered.', cta: 'Continue with Free',
    feat: ['Basic business page and page designs', 'Name, description, category and location', 'Business logo', 'Up to 5 photos', 'Basic social media links and contact info', 'Basic job listings', 'A few posts and announcements', 'Customer reviews and your replies', 'One business owner account']
  },
  basic: {
    name: 'Basic', tag: 'Grow your presence.', cta: 'Choose Basic — TT$75/month', price: 'TT$75/month',
    feat: ['Everything in Free, plus:', 'head:Design', 'More page designs and themes, including ones for restaurants, retail, beauty, construction and services', 'More colour and appearance choices', 'head:Photos', 'Around 30–40 photos and a larger gallery', 'head:Team', 'Owner plus up to 2 staff or manager accounts', 'More posts, social links and better job listings', 'head:Visibility', 'Featured placement in discovery sections (rotates between businesses)', 'head:Analytics', 'Page, job and post views', 'Website and phone/contact clicks']
  },
  pro: {
    name: 'Pro', tag: 'Make your business your own.', cta: 'Choose Pro — TT$150/month', price: 'TT$150/month',
    feat: ['Everything in Basic, plus:', 'head:Page customisation', 'Drag-and-drop sections: reorder About, Gallery, Products, Staff, Jobs, Reviews and Contact', 'Premium layouts and your own custom sections', 'head:Photos', '100+ photos, sorted into categories like Products, Projects, Events and Team', 'head:Team', 'Owner plus 10 or more staff accounts', 'Roles (Manager, Staff, Viewer) and permissions for editing, posts, photos, jobs and analytics', 'head:Analytics and hiring', 'Views over time, top posts, top jobs and visitor trends', 'More post allowance and hiring tools', 'head:Visibility', 'Priority search placement and enhanced featured placement']
  }
};
let ppSelected = 'basic';
function renderPremiumPlan(key){
  ppSelected = key;
  const p = PP_PLANS[key];
  document.querySelectorAll('.ppPlan').forEach(b => {
    const on = b.dataset.plan === key;
    b.classList.toggle('sel', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  document.getElementById('ppName').textContent = p.name;
  document.getElementById('ppTag').textContent = p.tag;
  const ul = document.getElementById('ppFeat'); ul.innerHTML = '';
  p.feat.forEach(f => {
    const li = document.createElement('li');
    if (f.startsWith('head:')){ li.className = 'head'; li.textContent = f.slice(5); }
    else if (f.endsWith('plus:')){ li.className = 'head'; li.style.textTransform = 'none'; li.style.fontSize = '14px'; li.style.color = 'inherit'; li.textContent = f; }
    else li.textContent = f;
    ul.appendChild(li);
  });
  const cta = document.getElementById('ppCta');
  cta.textContent = p.cta; cta.className = key === 'free' ? 'free' : '';
  document.getElementById('premiumMsg').textContent = '';
}

  function build() {
    if (built) return;
    built = true;
    var st = document.createElement('style'); st.textContent = CSS + BTN_CSS; document.head.appendChild(st);
    var wrap = document.createElement('div'); wrap.innerHTML = MARKUP; document.body.appendChild(wrap.firstChild);
    document.querySelectorAll('.ppPlan').forEach(function (b) { b.addEventListener('click', function () { renderPremiumPlan(b.dataset.plan); }); });
    document.getElementById('premiumPopupClose').addEventListener('click', close);
    document.getElementById('premiumPopup').addEventListener('mousedown', function (e) { if (e.target.id === 'premiumPopup') close(); });
    document.getElementById('ppCta').addEventListener('click', function () {
      if (ppSelected === 'free') { close(); return; }
      // Payments for Basic and Pro are not connected yet.
      document.getElementById('premiumMsg').textContent = PP_PLANS[ppSelected].name + ' is not open for payment yet. We will let you know as soon as it is.';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
  function open() {
    build();
    lastFocus = document.activeElement;
    renderPremiumPlan(ppSelected);
    document.getElementById('premiumPopup').classList.add('open');
    document.getElementById('premiumPopupClose').focus();
  }
  function close() {
    var p = document.getElementById('premiumPopup');
    if (!p) return;
    p.classList.remove('open');
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  window.ttOpenPremium = open;
  window.ttClosePremium = close;

  function mountButton() {
    if (document.querySelector('.ttPremiumBtn')) return;
    build();
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ttPremiumBtn'; b.textContent = '✨ Premium';
    b.addEventListener('click', open);
    var toggle = document.getElementById('themeToggleBtn');
    var right = document.querySelector('header .right');
    var emptySpan = document.querySelector('header > span:last-child:empty');
    if (toggle && toggle.parentNode) toggle.parentNode.insertBefore(b, toggle);
    else if (right) right.insertBefore(b, right.firstChild);
    else if (emptySpan) emptySpan.appendChild(b);
    else { b.classList.add('floating'); document.body.appendChild(b); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
  else mountButton();
})();
