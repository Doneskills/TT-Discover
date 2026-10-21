// Shared Premium popup + the small "Premium" button that sits beside the dark-mode toggle.
// Loaded on site pages (home, Business Studio, settings, profile, legal pages) but not on business pages.
(function () {
  var CSS = '  #premiumPopup {\n    --pp-bg: var(--card-bg, var(--card, #fff)); --pp-soft: var(--soft-bg, #f1e9dc); --pp-muted: var(--text-muted, var(--muted, #777)); --pp-text: var(--text, #2a2a2a); color: var(--pp-text);\n    font-family: \'Segoe UI\', system-ui, sans-serif;\n    position: fixed; inset: 0; background: rgba(0,0,0,0.5);\n    display: none; align-items: center; justify-content: center; z-index: 99990; padding: 16px;\n  }\n  #premiumPopup.open { display: flex; }\n  #premiumPopupPanel {\n    background: var(--pp-bg); border-radius: 18px; max-width: 860px; width: 100%;\n    height: min(660px, 88vh); overflow: hidden; position: relative;\n    display: grid; grid-template-columns: 320px 1fr; grid-template-rows: minmax(0, 1fr);\n  }\n  #premiumPopupClose {\n    position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 50%;\n    border: 2px solid #1a1a1a; background: transparent; color: #1a1a1a; font-size: 16px; font-weight: 700;\n    cursor: pointer; z-index: 2; line-height: 1; padding: 0;\n  }\n  [data-theme="dark"] #premiumPopupClose { border-color: var(--pp-text); color: var(--pp-text); }\n  .ppLeft {\n    background: #ff7420; color: #111; padding: 34px 22px; position: relative; overflow: hidden;\n  }\n  .ppLeft::before {\n    content: \'\'; position: absolute; top: -90px; left: -90px; width: 260px; height: 260px; border-radius: 50%;\n    background: linear-gradient(135deg, rgba(150,110,10,.85), rgba(255,170,40,.55)); pointer-events: none;\n  }\n  .ppLeft > * { position: relative; }\n  .ppLeft h2 { font-size: 26px; font-weight: 400; line-height: 1.2; margin: 0 0 26px; padding: 0; }\n  .ppPlan {\n    display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; cursor: pointer;\n    margin: 0 0 14px; padding: 12px 18px; border-radius: 999px; border: 2px solid #111;\n    background: #c9733f; color: #111; font-family: inherit;\n  }\n  .ppPlan:hover { filter: brightness(1.06); }\n  .ppPlan:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }\n  .ppDot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #111; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }\n  .ppPlan.sel .ppDot { background: #fff; }\n  .ppPlan.sel .ppDot::after { content: \'\'; width: 9px; height: 9px; border-radius: 50%; border: 2px solid #111; box-sizing: border-box; }\n  .ppPlan b { display: block; font-size: 17px; }\n  .ppPlan span.pr { font-size: 13px; }\n  .ppHave { margin-left: auto; flex-shrink: 0; background: #fff; color: #111; border: 2px solid #111; border-radius: 999px; font-size: 12px; font-weight: 700; padding: 3px 10px; white-space: nowrap; }\n  .ppRight { padding: 34px 40px 28px 34px; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; -webkit-overflow-scrolling: touch; }\n  .ppRight h3 { font-size: 21px; margin: 0 0 4px; padding-right: 40px; }\n  .ppTag { font-size: 14px; color: var(--pp-muted); margin-bottom: 14px; }\n  .ppFeat { list-style: none; padding: 0; margin: 0 0 10px; }\n  .ppFeat li { font-size: 14.5px; line-height: 1.45; padding: 5px 0 5px 26px; position: relative; }\n  .ppFeat li::before { content: \'✓\'; position: absolute; left: 2px; color: #e0562f; font-weight: 700; }\n  .ppFeat li.head { padding-left: 0; font-weight: 700; margin-top: 10px; color: var(--pp-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }\n  .ppFeat li.head::before { content: none; }\n  .ppAction { margin-top: auto; padding-top: 12px; position: sticky; bottom: -28px; background: var(--pp-bg); padding-bottom: 28px; box-shadow: 0 -10px 12px -6px var(--pp-bg); }\n  .ppAction button { width: 100%; padding: 13px; border-radius: 12px; border: none; background: #e0562f; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; font-family: inherit; }\n  .ppAction button.free { background: transparent; color: #e0562f; border: 2px solid #e0562f; }\n  .ppAction button.free:hover { background: rgba(224, 86, 47, .1); }\n  .ppLink { background: none; border: none; color: #e0562f; text-decoration: underline; cursor: pointer; font-family: inherit; font-size: 13px; padding: 6px 0; margin-top: 4px; width: auto; }\n  .ppFine { font-size: 12px; color: var(--pp-muted); margin-top: 10px; line-height: 1.5; }\n  @media (max-width: 700px) {\n    #premiumPopupPanel { grid-template-columns: 1fr; grid-template-rows: auto; height: auto; max-height: 88vh; overflow-y: auto; }\n    .ppLeft { padding: 24px 18px 8px; }\n    .ppLeft::before { width: 200px; height: 200px; top: -90px; left: -90px; }\n    .ppLeft h2 { font-size: 22px; margin-bottom: 18px; padding-right: 44px; }\n    .ppPlan { margin-bottom: 10px; padding: 10px 16px; }\n    .ppRight { padding: 20px 20px 24px; overflow: visible; }\n    .ppAction { position: static; box-shadow: none; padding-bottom: 0; }\n    #premiumPopupClose { border-color: #111; color: #111; }\n  }\n\n';
  var BTN_CSS = "\n  .ttPremiumBtn {\n    font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; font-weight: 700; line-height: 1;\n    padding: 6px 12px; border-radius: 999px; border: 1px solid #e0562f; background: #fff; color: #e0562f;\n    cursor: pointer; white-space: nowrap; margin: 0; width: auto;\n  }\n  .ttPremiumBtn:hover { background: #fff3ea; }\n  .ttPremiumBtn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 4px #e0562f; }\n  @media (max-width: 480px) { .ttPremiumBtn { font-size: 11px; padding: 5px 9px; } }\n  .right > .ttPremiumBtn { margin-right: 8px; }\n  .ttPremiumBtn.floating { position: fixed; top: 12px; right: 12px; z-index: 9990; box-shadow: 0 2px 8px rgba(0,0,0,.2); }\n";
  var MARKUP = '<div id="premiumPopup">\n  <div id="premiumPopupPanel" role="dialog" aria-modal="true" aria-labelledby="ppTitle">\n    <button id="premiumPopupClose" type="button" aria-label="Close">✕</button>\n    <div class="ppLeft">\n      <h2 id="ppTitle">Try TT Discover for free</h2>\n      <div role="radiogroup" aria-label="Choose a plan">\n        <button type="button" class="ppPlan" role="radio" data-plan="free"><span class="ppDot"></span><span><b>Free</b><span class="pr">TT$0/month</span></span></button>\n        <button type="button" class="ppPlan" role="radio" data-plan="basic"><span class="ppDot"></span><span><b>Basic</b><span class="pr">Free for the first month<br>then TT$75/month</span></span></button>\n        <button type="button" class="ppPlan" role="radio" data-plan="pro"><span class="ppDot"></span><span><b>Pro</b><span class="pr">Free for the first month<br>then TT$150/month</span></span></button>\n      </div>\n    </div>\n    <div class="ppRight">\n      <h3 id="ppName"></h3>\n      <div class="ppTag" id="ppTag"></div>\n      <ul class="ppFeat" id="ppFeat"></ul>\n      <div class="ppAction">\n        <button type="button" id="ppCta"></button>\n        <div id="ppPay" style="display:none;margin-top:6px;"></div>\n        <div class="ppFine" id="ppPrice"></div><button type="button" id="ppCancel" class="ppLink" style="display:none">Cancel subscription</button><div class="ppFine" id="premiumMsg" role="status"></div>\n        <div class="ppFine">Plans and limits may change before launch.</div>\n      </div>\n    </div>\n  </div>\n</div>';
  var built = false, lastFocus = null;

const PP_PLANS = {
  free: {
    name: 'Free', tag: 'Get discovered.', cta: 'Choose free plan',
    feat: ['head:Your page', 'Business page with every page design and a page colour picker', 'Name, description, category, location, opening hours and business logo', 'All your social media links (Facebook, Instagram, Website, TikTok, YouTube, WhatsApp, X) and contact info', 'head:Content', 'Up to 5 photos', 'Up to 3 posts and 2 job listings', 'Deals and the Hiring now badge', 'head:Customers', 'Customer reviews, and your replies', 'Page views for the last 30 days', 'head:Team', '1 business', 'Invite collaborators and add staff with their own permissions, free']
  },
  basic: {
    name: 'Basic', tag: 'Grow your presence.', cta: 'Start Basic — free for 1 month', fine: 'Then TT$75/month. PayPal bills in US dollars (about US$11).',
    feat: ['Everything in Free, plus:', 'head:Design', 'Text & Fonts: change the headings, tab names, button wording and fonts on your page, with a live preview', 'head:Content', 'Up to 35 photos', 'Up to 15 posts and 10 job listings', 'Up to 3 businesses', 'head:Visibility', 'Featured placement in discovery sections (rotates between businesses)', 'head:Analytics', 'Phone, email, website and social link taps', 'Job and post page visits']
  },
  pro: {
    name: 'Pro', tag: 'Make your business your own.', cta: 'Start Pro — free for 1 month', fine: 'Then TT$150/month. PayPal bills in US dollars (about US$22).',
    feat: ['Everything in Basic, plus:', 'head:Page Builder', 'Build your own page from a blank one: columns, headings, text, photos, buttons, and blocks for your hours, contact, menu, posts, jobs and reviews', 'Five ready-made starter layouts and your own page colours', 'head:Content', 'Up to 100 photos, sorted into Products, Projects, Events and Team galleries', 'Up to 50 posts and 30 job listings', 'Up to 5 businesses', 'head:Visibility', 'Priority placement in discovery sections', 'head:Coming soon', 'Verified badge', 'WhatsApp button on your page', 'A free boost each month', 'Monthly results email', 'Top posts, top jobs and visitor trends']
  }
};
let ppWatchTimer = null;
// After someone starts a PayPal subscription, check every few seconds whether the plan has switched, so the popup updates
// even when the PayPal window does not close by itself.
function watchForPlan(key, token){
  clearInterval(ppWatchTimer);
  let tries = 0;
  ppWatchTimer = setInterval(async () => {
    if (++tries > 45) { clearInterval(ppWatchTimer); return; }
    try {
      const r = await fetch('/api/me', { headers: { 'x-auth-token': token } });
      const d = r.ok ? await r.json() : null;
      if (d && d.plan === key) {
        clearInterval(ppWatchTimer); ppMyPlan = key; ppMyMethod = 'paypal'; ppMyUntil = null; renderPremiumPlan(key);
        document.getElementById('premiumMsg').textContent = "You're on " + PP_PLANS[key].name + '! Refresh your Settings page to see your new features.';
      }
    } catch (e) {}
  }, 4000);
}
let ppSelected = 'basic';
let ppMyMethod = '', ppMyUntil = null;
let ppMyPlan = '';   // 'free', 'basic' or 'pro' once we know who is signed in

function renderPremiumPlan(key){
  ppSelected = key;
  const p = PP_PLANS[key];
  document.querySelectorAll('.ppPlan').forEach(b => {
    const on = b.dataset.plan === key;
    b.classList.toggle('sel', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    const old = b.querySelector('.ppHave'); if (old) old.remove();
    if (ppMyPlan && b.dataset.plan === ppMyPlan){
      const tick = document.createElement('span'); tick.className = 'ppHave'; tick.textContent = '✓ Your plan';
      b.appendChild(tick);
    }
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
  const mine = ppMyPlan && key === ppMyPlan;
  cta.textContent = mine ? '✓ This is your current plan' : p.cta; cta.className = (key === 'free' || mine) ? 'free' : '';
  document.getElementById('premiumMsg').textContent = '';
  const dateText = ppMyUntil ? new Date(ppMyUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  document.getElementById('ppPrice').textContent = mine ? (key === 'free' ? '' : ppMyUntil ? 'Your subscription is cancelled. You keep ' + p.name + ' until ' + dateText + '.' : ppMyMethod === 'paypal' ? 'Renews monthly. You can cancel any time and keep your plan until the period you paid for ends.' : '') : (p.fine || '');
  const cancelBtn = document.getElementById('ppCancel');
  if (cancelBtn) cancelBtn.style.display = (mine && key !== 'free' && ppMyMethod === 'paypal' && !ppMyUntil) ? '' : 'none';
  const pay = document.getElementById('ppPay'); if (pay){ pay.innerHTML = ''; pay.style.display = 'none'; }
  cta.style.display = '';
}

let ppCfg = null, ppSdk = null;
function ppConfig(){
  if (ppCfg) return Promise.resolve(ppCfg);
  return fetch('/api/paypal/config').then(r => r.json()).then(c => (ppCfg = c)).catch(() => ({}));
}
function ppLoadSdk(clientId){
  if (window.paypal) return Promise.resolve();
  if (!ppSdk) ppSdk = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&vault=true&intent=subscription';
    sc.onload = res; sc.onerror = () => { ppSdk = null; rej(new Error('sdk')); };
    document.head.appendChild(sc);
  });
  return ppSdk;
}
async function ppStart(){
  const key = ppSelected, msg = document.getElementById('premiumMsg');
  const token = (function(){ try { return localStorage.getItem('ttp_token'); } catch (e) { return ''; } })();
  if (!token){
    msg.innerHTML = 'Please <a href="/account.html" style="color:#e0562f;font-weight:700;">sign in or create an account</a> first, then choose your plan.';
    try { localStorage.setItem('ttp_premium_pending', '1'); } catch (e) {}
    return;
  }
  msg.textContent = 'One moment...';
  const cfg = await ppConfig();
  if (!cfg.clientId || !cfg.plans || !cfg.plans[key]){ msg.textContent = PP_PLANS[key].name + ' is not open for payment yet. We will let you know as soon as it is.'; return; }
  try { await ppLoadSdk(cfg.clientId); }
  catch (e) { msg.textContent = 'PayPal could not load. Check your connection and try again.'; return; }
  document.getElementById('ppCta').style.display = 'none';
  const pay = document.getElementById('ppPay'); pay.style.display = 'block'; pay.innerHTML = '';
  msg.textContent = 'Pay with PayPal or a card. You will not be charged for the first month, and you can cancel any time before it ends.';
  window.paypal.Buttons({
    style: { layout: 'vertical', shape: 'pill', label: 'subscribe' },
    createSubscription: async (data, actions) => {
      // A signed tag lets the site find this account even if the PayPal window never reports back.
      let customId = '';
      try { const t = await fetch('/api/premium/paypal/start', { method: 'POST', headers: { 'x-auth-token': token } }); customId = ((await t.json()) || {}).customId || ''; } catch (e) {}
      const id = await actions.subscription.create(customId ? { plan_id: cfg.plans[key], custom_id: customId } : { plan_id: cfg.plans[key] });
      watchForPlan(key, token);
      return id;
    },
    onApprove: async (data) => {
      msg.textContent = 'Confirming your plan...';
      try {
        const r = await fetch('/api/premium/paypal/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ subscriptionId: data.subscriptionID }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok){ msg.textContent = d.error || 'Could not confirm your plan. If PayPal says it went through, contact us and we will sort it out.'; return; }
        clearInterval(ppWatchTimer); ppMyPlan = key; ppMyMethod = 'paypal'; ppMyUntil = null; renderPremiumPlan(key);
        document.getElementById('premiumMsg').textContent = "You're on " + PP_PLANS[key].name + '! Refresh your Settings page to see your new features.';
      } catch (e) { msg.textContent = 'Could not reach the site. If PayPal says it went through, refresh in a minute.'; }
    },
    onError: () => { msg.textContent = 'PayPal had a problem. Please try again.'; }
  }).render('#ppPay');
}

  function build() {
    if (built) return;
    built = true;
    var st = document.createElement('style'); st.textContent = CSS + BTN_CSS; document.head.appendChild(st);
    var wrap = document.createElement('div'); wrap.innerHTML = MARKUP; document.body.appendChild(wrap.firstChild);
    document.querySelectorAll('.ppPlan').forEach(function (b) { b.addEventListener('click', function () { renderPremiumPlan(b.dataset.plan); }); });
    document.getElementById('premiumPopupClose').addEventListener('click', close);
    document.getElementById('premiumPopup').addEventListener('mousedown', function (e) { if (e.target.id === 'premiumPopup') close(); });
    document.getElementById('ppCancel').addEventListener('click', async function () {
      var text = 'Cancel your ' + PP_PLANS[ppMyPlan].name + ' subscription? You keep it until the period you have paid for ends, and you will not be charged again.';
      var ok = window.ttConfirm ? await window.ttConfirm(text, { ok: 'Cancel subscription', cancel: 'Keep it', danger: true }) : window.confirm(text);
      if (!ok) return;
      var msg = document.getElementById('premiumMsg'); msg.textContent = 'Cancelling...';
      try {
        var r = await fetch('/api/premium/paypal/cancel', { method: 'POST', headers: { 'x-auth-token': localStorage.getItem('ttp_token') || '' } });
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok) { msg.textContent = d.error || 'Could not cancel. Please try again or contact us.'; return; }
        ppMyPlan = d.plan || ppMyPlan; ppMyUntil = d.until || null;
        if (ppMyPlan === 'free') ppMyMethod = '';
        renderPremiumPlan(ppMyPlan === 'free' ? 'free' : ppSelected);
      } catch (e) { msg.textContent = 'Could not reach the site. Please try again.'; }
    });
    document.getElementById('ppCta').addEventListener('click', function () {
      if (ppSelected === 'free' && ppMyPlan && ppMyPlan !== 'free') {
        document.getElementById('premiumMsg').textContent = 'To go back to Free, open your current plan here and tap Cancel subscription. You keep your plan until the period you paid for ends.';
        return;
      }
      if (ppSelected === 'free' || ppSelected === ppMyPlan) { close(); return; }
      ppStart();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
  function loadMyPlan() {
    try {
      var t = localStorage.getItem('ttp_token');
      if (!t) return;
      fetch('/api/me', { headers: { 'x-auth-token': t } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.plan) return;
          ppMyPlan = d.plan; ppMyMethod = d.premiumMethod || ''; ppMyUntil = d.premiumExpiresAt || null;
          if (ppMyPlan !== 'free') ppSelected = ppMyPlan;
          renderPremiumPlan(ppSelected);
        })
        .catch(function () {});
    } catch (e) {}
  }
  function open() {
    build();
    lastFocus = document.activeElement;
    renderPremiumPlan(ppSelected);
    loadMyPlan();
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
  function showPending() {
    try {
      if (localStorage.getItem('ttp_premium_pending')) { localStorage.removeItem('ttp_premium_pending'); setTimeout(open, 900); }
    } catch (e) {}
  }
  function init() { mountButton(); showPending(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
