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
