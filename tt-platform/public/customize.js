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
    '.cb-ph{border:2px dashed #bbb;border-radius:12px;padding:26px;text-align:center;color:#888;font-size:14px}' +
    '.cb-row{display:grid;gap:8px 24px;margin:0 0 18px;align-items:start}' +
    '.cb-row.c2{grid-template-columns:repeat(2,minmax(0,1fr))}.cb-row.c3{grid-template-columns:repeat(3,minmax(0,1fr))}' +
    '.cb-cell{min-width:0}.cb-cell>.cb:last-child{margin-bottom:0}' +
    '@media(max-width:640px){.cb-row.c2,.cb-row.c3{grid-template-columns:minmax(0,1fr)}}' +
    '.cb-data{font-family:var(--body,inherit);color:var(--text,#222);margin:0 0 22px;max-width:100%}' +
    '.cb-data .cbStatus{font-weight:700;margin:0 0 6px}.cb-data .cbStatus.open{color:var(--ok,#1a7a3c)}.cb-data .cbStatus.closed{color:var(--bad,#c40d0d)}' +
    '.cb-data .cbLines div{padding:4px 0;border-bottom:1px dotted var(--divider,#ddd);font-size:15px}' +
    '.cb-data .cbBtns{display:flex;flex-wrap:wrap;gap:10px}.cb-data .cbAddr{font-size:16px;margin:0 0 10px;line-height:1.5}' +
    '.cb-data .grid{margin-top:4px}' +
    '.cb-ph-data{border:2px dashed var(--divider,#cdbfa8);border-radius:12px;padding:14px 16px;background:rgba(127,127,127,.07);color:var(--text,#444);font-size:14px;line-height:1.5}' +
    '.cb-ph-data b{display:block;font-size:15px;color:var(--title,var(--text,#222));margin-bottom:2px}.cb-ph-data small{color:var(--muted,#777);display:block}.cb-ph-data i{font-style:normal;color:var(--text,#222);display:block;margin-top:4px;font-size:13px;word-break:break-word}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function escA(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function okImg(u, editing) {
    u = String(u || '');
    return /^\/img\/[a-f0-9]{24}$/.test(u) || /^https:\/\/[^\s"'<>`]+$/.test(u) || (editing && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u));
  }
  function okLink(u) { return /^(https?:\/\/|mailto:|tel:)[^\s"'<>`]+$/i.test(String(u || '')); }
  var pick = function (v, list, d) { return list.indexOf(v) >= 0 ? v : d; };

  // Blocks that show the business's own information automatically. Keep the keys in step with DATA_BLOCK_TYPES in server.js.
  // title: default heading (the owner can change it), count: choices for how many to show.
  var DATA = {
    hours: { name: 'Opening hours', icon: '🕒', title: 'Opening hours', note: "Shows whether you are open now and your hours. Change them under Location." },
    contact: { name: 'Call and email', icon: '📞', title: 'Contact', note: 'Call and email buttons. Change them under Location.' },
    location: { name: 'Address', icon: '📍', title: 'Find us', note: 'Your address with an Open in Maps button. Change it under Location.' },
    social: { name: 'Social links', icon: '🔗', title: 'Follow us', note: 'Your Facebook, Instagram and other links. Change them under Social Media Links.' },
    gallery: { name: 'Photo gallery', icon: '🖼️', title: 'Photos', count: [3, 6, 9, 12], defCount: 6, note: 'Your business photos in a grid. Add them under Overview.' },
    about: { name: 'About details', icon: 'ℹ️', note: 'The details from your About section, like parking and payments.' },
    menu: { name: 'Menu', icon: '🍽️', note: 'Your menu items, menu photos and highlights. Change them under Overview.' },
    posts: { name: 'Latest posts', icon: '📰', count: [3, 5, 10], defCount: 5, note: 'Your newest posts. Write them under Posts.' },
    jobs: { name: 'Jobs', icon: '💼', note: 'Your job listings. Add them under Jobs.' },
    reviews: { name: 'Reviews', icon: '⭐', once: true, note: 'Your star rating and reviews, with a box for customers to leave one. You can add this once per page.' }
  };
  var DATA_ORDER = ['hours', 'contact', 'location', 'social', 'gallery', 'about', 'menu', 'posts', 'jobs', 'reviews'];

  function placeholder(b, opts) {
    var d = DATA[b.type], biz = (opts && opts.biz) || {}, line = '';
    if (b.type === 'hours') line = window.ttCompactHours ? window.ttCompactHours(biz.hours) : '';
    else if (b.type === 'contact') line = [biz.phone, biz.email].filter(Boolean).join('  ·  ');
    else if (b.type === 'location') line = [biz.address, biz.area].filter(Boolean).join(', ');
    else if (b.type === 'social') line = ['facebook', 'instagram', 'website', 'tiktok', 'youtube', 'whatsapp', 'x'].filter(function (k) { return (biz.social || {})[k]; }).join(', ');
    else if (b.type === 'gallery') { var gn = (biz.photos || []).filter(function (u, i) { return u && (!b.cat || (biz.photoCats || [])[i] === b.cat); }).length; line = gn ? gn + ' photo(s) added' : (b.cat ? 'No photos in this category yet' : 'No photos added yet'); }
    return '<div class="cb cb-ph-data"><b>' + d.icon + ' ' + escA(b.title || d.title || d.name) + '</b><small>' + escA(d.note) + '</small>' + (line ? '<i>' + escA(line) + '</i>' : '') + '</div>';
  }

  function blockHtml(b, editing, opts) {
    var al = pick(b.align, ['left', 'center', 'right'], 'left');
    if (DATA[b.type]) {
      if (opts && opts.render) {
        var inner = opts.render(b);
        return inner ? '<section class="cb cb-data cb-data-' + b.type + '">' + inner + '</section>' : '';
      }
      return editing ? placeholder(b, opts) : '';
    }
    switch (b.type) {
      case 'row':
        var cells = (b.cells || []).slice(0, 3);
        var cols = pick(Number(b.cols), [2, 3], 2);
        return '<div class="cb cb-row c' + cols + '">' + cells.slice(0, cols).map(function (c) {
          return '<div class="cb-cell">' + (c && c.type !== 'row' && c.type !== 'reviews' ? blockHtml(c, editing, opts) : '') + '</div>';
        }).join('') + '</div>';
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
  // The basic blocks, then (separately) the ones that show the business's own information.
  window.TT_BLOCK_TYPES = [['heading', 'Heading', '🔤'], ['text', 'Text', '📝'], ['photo', 'Photo', '🖼️'], ['button', 'Button', '🔘'], ['row', 'Columns', '▥'], ['divider', 'Divider', '➖'], ['spacer', 'Space', '↕️']];
  window.TT_DATA_BLOCKS = DATA;
  window.TT_DATA_ORDER = DATA_ORDER;
  window.ttNewBlock = function (type) {
    var d = {
      heading: { text: 'Your heading', size: 'm', align: 'left' },
      text: { text: 'Write something about your business here.', align: 'left' },
      photo: { url: '', caption: '', width: 'full', align: 'center' },
      button: { label: 'Contact us', url: '', style: 'filled', align: 'left' },
      divider: {}, spacer: { size: 'm' }
    }[type];
    if (type === 'row') {
      return { id: uid(), type: 'row', cols: 2, cells: [window.ttNewBlock('text'), window.ttNewBlock('photo')] };
    }
    if (!d && DATA[type]) {
      d = { title: '' };
      if (DATA[type].count) d.count = DATA[type].defCount;
    }
    return Object.assign({ id: uid(), type: type }, d || {});
  };
  // opts: { editing, biz, render } - biz and render are only needed for the blocks that show the business's information.
  window.ttBlocksHtml = function (blocks, opts) {
    var editing = !!(opts && opts.editing);
    return (blocks || []).map(function (b) { return blockHtml(b || {}, editing, opts); }).join('');
  };
})();

// ---------------- Page Builder: colours, starter layouts and photo categories ----------------
(function () {
  var ok = function (c) { return /^#[0-9a-f]{6}$/i.test(c || ''); };
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
  // The page colours an owner can pick: bg, text, accent (buttons) and title (headings). Keep in step with sanitizeLayout in server.js.
  window.ttThemeVars = function (t) {
    var v = {};
    if (!t) return v;
    if (ok(t.bg)) v['--bg'] = t.bg;
    if (ok(t.text)) v['--text'] = t.text;
    if (ok(t.bg) || ok(t.text)) {
      var mix = function (p) { return 'color-mix(in srgb, var(--text) ' + p + '%, var(--bg))'; };
      v['--surface'] = mix(8); v['--divider'] = mix(18); v['--track'] = mix(14); v['--muted'] = mix(62); v['--field'] = mix(4); v['--fieldBorder'] = mix(25);
    }
    if (ok(t.accent)) { v['--accent'] = t.accent; v['--onAccent'] = lum(t.accent) > 0.6 ? '#111111' : '#ffffff'; }
    if (ok(t.title)) v['--title'] = t.title;
    return v;
  };
  window.ttApplyTheme = function (el, t) {
    (el._ttTheme || []).forEach(function (k) { el.style.removeProperty(k); });
    var v = window.ttThemeVars(t);
    Object.keys(v).forEach(function (k) { el.style.setProperty(k, v[k]); });
    el._ttTheme = Object.keys(v);
  };
  window.TT_PALETTES = [
    { name: 'Clean', bg: '#ffffff', text: '#222222', accent: '#e0562f', title: '#222222' },
    { name: 'Night', bg: '#16181d', text: '#e8e6e3', accent: '#f2a33c', title: '#ffffff' },
    { name: 'Ocean', bg: '#f2f8fb', text: '#12303f', accent: '#1b7fb5', title: '#0d4f73' },
    { name: 'Garden', bg: '#f4f8ef', text: '#213322', accent: '#3a8a4f', title: '#1f5a31' },
    { name: 'Sunset', bg: '#fff4ea', text: '#3a2217', accent: '#e0562f', title: '#a8321a' },
    { name: 'Berry', bg: '#fbf1f6', text: '#3a1f2c', accent: '#b23a74', title: '#7a2050' },
    { name: 'Gold', bg: '#141414', text: '#f1efe9', accent: '#f5b000', title: '#f5c542' }
  ];
  window.TT_PHOTO_CATS = [['products', 'Products'], ['projects', 'Projects'], ['events', 'Events'], ['team', 'Team']];

  var B = function (type, props) { return Object.assign(window.ttNewBlock(type), props || {}); };
  var pal = function (n) { var p = window.TT_PALETTES.filter(function (x) { return x.name === n; })[0]; return { bg: p.bg, text: p.text, accent: p.accent, title: p.title }; };
  // Ready-made pages to start from. build(name) returns { blocks, theme }.
  window.TT_STARTERS = [
    { id: 'welcome', name: 'Welcome', icon: '👋', desc: 'A friendly front page: intro, call button, hours, address and reviews.',
      build: function (n) { return { theme: pal('Clean'), blocks: [
        B('heading', { text: n || 'Your business name', size: 'l' }),
        B('text', { text: 'Tell people what you do and why they should visit.' }),
        B('button', { label: 'Call us' }),
        B('divider'),
        B('row', { cols: 2, cells: [B('hours'), B('location')] }),
        B('contact'), B('reviews')] }; } },
    { id: 'showcase', name: 'Show it off', icon: '📸', desc: 'Lead with photos: a big gallery, a story with a picture, then your latest posts.',
      build: function (n) { return { theme: pal('Ocean'), blocks: [
        B('heading', { text: n || 'Your business name', size: 'l' }),
        B('text', { text: 'A short line about your work.' }),
        B('gallery', { count: 9 }),
        B('row', { cols: 2, cells: [B('text', { text: 'Our story\nWrite a few lines about how you started and what makes you different.' }), B('photo')] }),
        B('button', { label: 'Get in touch' }),
        B('posts', { count: 3 }), B('contact')] }; } },
    { id: 'menu', name: 'Menu and more', icon: '🍽️', desc: 'For food and drink: your menu up front, then hours, address and reviews.',
      build: function (n) { return { theme: pal('Sunset'), blocks: [
        B('heading', { text: n || 'Your business name', size: 'l' }),
        B('text', { text: 'Fresh, local and made with love.' }),
        B('menu'), B('divider'),
        B('row', { cols: 2, cells: [B('hours'), B('location')] }),
        B('reviews')] }; } },
    { id: 'services', name: 'Services', icon: '🧰', desc: 'Three columns for what you offer, a book button, your details and any jobs.',
      build: function (n) { return { theme: pal('Garden'), blocks: [
        B('heading', { text: n || 'Your business name', size: 'l' }),
        B('text', { text: 'What we can do for you.' }),
        B('row', { cols: 3, cells: [B('text', { text: 'Service one\nDescribe it in a line or two.' }), B('text', { text: 'Service two\nDescribe it in a line or two.' }), B('text', { text: 'Service three\nDescribe it in a line or two.' })] }),
        B('button', { label: 'Book now' }),
        B('about'), B('contact'), B('jobs')] }; } },
    { id: 'night', name: 'Night out', icon: '🌙', desc: 'Dark and bold, with centred words, a photo gallery and your opening hours.',
      build: function (n) { return { theme: pal('Night'), blocks: [
        B('heading', { text: n || 'Your business name', size: 'l', align: 'center' }),
        B('text', { text: 'Good vibes. Good people.', align: 'center' }),
        B('gallery', { count: 6 }),
        B('hours'), B('location'),
        B('button', { label: 'Call to reserve', align: 'center' }),
        B('reviews')] }; } }
  ];
})();
