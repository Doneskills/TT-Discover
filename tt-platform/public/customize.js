// Shared by the business page and Business Studio settings: the page names, headings and fonts a Basic or Pro
// business can change. Keep the keys in step with LABEL_KEYS, FONT_KEYS_HEAD and FONT_KEYS_BODY in server.js.
(function () {
  var SV = {
    beauty: { menu: 'Services', photos: 'Gallery', cta: 'Call to book', feat: 'Favourites', none: 'No services listed yet.' },
    build: { menu: 'Services', photos: 'Projects', cta: 'Call for a quote', feat: 'Featured work', none: 'No services listed yet.' },
    bar: { menu: 'Drinks & menu', photos: 'Gallery', cta: 'Call to reserve', feat: 'House favourites', none: 'No menu items listed yet.' },
    learn: { menu: 'Classes', photos: 'Gallery', cta: 'Call to enrol', feat: 'Popular classes', none: 'No classes listed yet.' },
    farm: { menu: "What's fresh", photos: 'Gallery', cta: 'Call to order', feat: 'In season', none: 'Nothing listed yet.' },
    office: { menu: 'Services', photos: 'Our work', cta: 'Book a consultation', feat: 'Featured', none: 'No services listed yet.' }
  };
  // [key, what it is called in the editor]
  var LABELS = [
    ['home', 'Home tab'], ['menu', 'Menu / services tab and heading'], ['photos', 'Photos tab and heading'], ['reviews', 'Reviews tab'],
    ['about', 'About tab and heading'], ['posts', 'Posts tab and heading'], ['jobs', 'Jobs tab and heading'],
    ['description', 'Description heading'], ['feat', 'Highlights heading'], ['pricelist', 'Menu photos heading'],
    ['cta', 'Call button'], ['rate', 'Review box heading']
  ];
  function defaults(t) {
    var s = SV[t] || null;
    return {
      home: 'Home', menu: s ? s.menu : 'Menu', photos: s ? s.photos : 'Photos', reviews: 'Reviews', about: 'About', posts: 'Posts', jobs: 'Jobs',
      description: 'Description', feat: s ? s.feat : 'Highlights', pricelist: 'Price list', cta: s ? s.cta : 'Call', rate: 'Rate and review'
    };
  }
  // Which of those the chosen design actually shows.
  function keysFor(t) {
    var hide = t === 'fabric' ? ['menu', 'feat', 'pricelist', 'cta'] : SV[t] ? [] : ['cta'];
    return LABELS.filter(function (l) { return hide.indexOf(l[0]) < 0; });
  }
  var STACKS = {
    oswald: "'Oswald','Arial Narrow',Impact,sans-serif",
    playfair: "'Playfair Display',Georgia,'Times New Roman',serif",
    bebas: "'Bebas Neue',Impact,sans-serif",
    merriweather: "'Merriweather',Georgia,serif",
    poppins: "'Poppins','Segoe UI',system-ui,sans-serif",
    vibes: "'Great Vibes',cursive",
    system: "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
  };
  window.TT_SV = SV;
  window.TT_FONT_STACKS = STACKS;
  window.TT_HEADING_FONTS = [['', "Design's own font"], ['oswald', 'Oswald: tall and bold'], ['playfair', 'Playfair Display: elegant serif'], ['bebas', 'Bebas Neue: big capitals'], ['merriweather', 'Merriweather: classic serif'], ['poppins', 'Poppins: clean and modern'], ['vibes', 'Great Vibes: script, for short names']];
  window.TT_BODY_FONTS = [['', "Design's own font"], ['poppins', 'Poppins: clean and modern'], ['merriweather', 'Merriweather: classic serif'], ['system', 'Simple system font']];
  window.ttLabelDefaults = defaults;
  window.ttLabelKeys = keysFor;
})();

// ---------------- Page Builder blocks (Pro "Start blank" pages) ----------------
// One renderer shared by the live business page and the builder canvas, so what the owner sees is what visitors get.
(function () {
  var CSS = '' +
    '.cb{margin:0 0 18px;max-width:100%}' +
    '.cb-h{font-family:var(--head,inherit);color:var(--title,var(--text,#222));line-height:1.15;margin:0 0 14px;font-weight:600;word-break:break-word}' +
    '.cb-h.s{font-size:20px}.cb-h.m{font-size:30px}.cb-h.l{font-size:clamp(34px,6vw,56px)}' +
    '.cb-t{font-family:var(--body,inherit);color:var(--text,#222);font-size:16px;line-height:1.65;word-break:break-word;margin:0 0 18px}' +
    '.cb-p{margin:0 0 18px}.cb-p img{display:block;max-width:100%;height:auto;border-radius:12px;cursor:zoom-in}' +
    '.cb-p.w-s{width:min(100%,220px)}.cb-p.w-m{width:min(100%,460px)}.cb-p.w-full{width:100%}' +
    '.cb-p.al-center{margin-left:auto;margin-right:auto}.cb-p.al-right{margin-left:auto}' +
    '.cb-p figcaption{font-size:13px;color:var(--muted,#666);margin-top:6px}' +
    '.cb-b{margin:0 0 18px}' +
    '.cbBtn{display:inline-block;padding:12px 26px;border-radius:26px;font-weight:700;font-size:15px;text-decoration:none;font-family:var(--body,inherit);background:var(--accent,#e0562f);color:var(--onAccent,#fff);border:2px solid var(--accent,#e0562f)}' +
    '.cbBtn.outline{background:transparent;color:var(--accent,#e0562f)}' +
    '.cb-d{border:none;border-top:2px solid var(--divider,#ddd);margin:22px 0}' +
    '.cb-s.s{height:16px}.cb-s.m{height:40px}.cb-s.l{height:80px}' +
    '.cb-ph{border:2px dashed #bbb;border-radius:12px;padding:26px;text-align:center;color:#888;font-size:14px}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function escA(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function okImg(u, editing) {
    u = String(u || '');
    return /^\/img\/[a-f0-9]{24}$/.test(u) || /^https:\/\/[^\s"'<>`]+$/.test(u) || (editing && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u));
  }
  function okLink(u) { return /^(https?:\/\/|mailto:|tel:)[^\s"'<>`]+$/i.test(String(u || '')); }
  var pick = function (v, list, d) { return list.indexOf(v) >= 0 ? v : d; };

  function blockHtml(b, editing) {
    var al = pick(b.align, ['left', 'center', 'right'], 'left');
    switch (b.type) {
      case 'heading':
        if (!b.text && !editing) return '';
        return '<h2 class="cb cb-h ' + pick(b.size, ['s', 'm', 'l'], 'm') + '" style="text-align:' + al + '">' + escA(b.text || (editing ? 'Your heading' : '')) + '</h2>';
      case 'text':
        if (!b.text && !editing) return '';
        return '<p class="cb cb-t" style="text-align:' + al + '">' + escA(b.text || (editing ? 'Write something here.' : '')).replace(/\n/g, '<br>') + '</p>';
      case 'photo':
        if (!okImg(b.url, editing)) return editing ? '<div class="cb cb-ph">🖼️ No photo yet. Choose one on the right.</div>' : '';
        return '<figure class="cb cb-p w-' + pick(b.width, ['s', 'm', 'full'], 'full') + ' al-' + al + '"><img src="' + escA(b.url) + '" alt="' + escA(b.caption || '') + '" loading="lazy">' +
          (b.caption ? '<figcaption>' + escA(b.caption) + '</figcaption>' : '') + '</figure>';
      case 'button':
        if (!b.label && !editing) return '';
        var ok = okLink(b.url), ext = ok && /^https?:/i.test(b.url);
        return '<div class="cb cb-b" style="text-align:' + al + '"><a class="cbBtn ' + (b.style === 'outline' ? 'outline' : '') + '" href="' + (ok ? escA(b.url) : '#') + '"' +
          (ext ? ' target="_blank" rel="noopener"' : '') + (ok && !editing ? ' data-track="website"' : '') + '>' + escA(b.label || 'Button') + '</a></div>';
      case 'divider': return '<hr class="cb cb-d">';
      case 'spacer': return '<div class="cb cb-s ' + pick(b.size, ['s', 'm', 'l'], 'm') + '" aria-hidden="true"></div>';
    }
    return '';
  }
  function uid() { return 'b' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
  window.TT_BLOCK_TYPES = [['heading', 'Heading', '🔤'], ['text', 'Text', '📝'], ['photo', 'Photo', '🖼️'], ['button', 'Button', '🔘'], ['divider', 'Divider', '➖'], ['spacer', 'Space', '↕️']];
  window.ttNewBlock = function (type) {
    var d = {
      heading: { text: 'Your heading', size: 'm', align: 'left' },
      text: { text: 'Write something about your business here.', align: 'left' },
      photo: { url: '', caption: '', width: 'full', align: 'center' },
      button: { label: 'Contact us', url: '', style: 'filled', align: 'left' },
      divider: {}, spacer: { size: 'm' }
    }[type] || {};
    return Object.assign({ id: uid(), type: type }, d);
  };
  window.ttBlocksHtml = function (blocks, opts) {
    var editing = !!(opts && opts.editing);
    return (blocks || []).map(function (b) { return blockHtml(b || {}, editing); }).join('');
  };
})();
