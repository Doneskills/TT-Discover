// Shared list of areas in Trinidad & Tobago, used by customers (to pick where they want updates)
// and by businesses (so both sides use exactly the same names and notifications match).
window.TT_AREAS = [
  { group: 'Port of Spain & West', areas: ['Port of Spain', 'St. James', 'Woodbrook', 'Belmont', 'Cascade', 'St. Ann\'s', 'Maraval', 'Diego Martin', 'Carenage', 'Chaguaramas', 'Laventille', 'Morvant', 'Barataria', 'San Juan', 'Santa Cruz'] },
  { group: 'East-West Corridor', areas: ['Arima', 'Arouca', 'Tunapuna', 'Tacarigua', 'Curepe', 'St. Augustine', 'Trincity', 'Piarco', 'Valsayn'] },
  { group: 'Central', areas: ['Chaguanas', 'Cunupia', 'Freeport', 'Couva', 'Claxton Bay', 'California', 'Longdenville'] },
  { group: 'South', areas: ['San Fernando', 'Marabella', 'Gasparillo', 'Princes Town', 'Debe', 'Penal', 'Siparia', 'Fyzabad', 'Point Fortin', 'La Brea', 'Rio Claro', 'Moruga'] },
  { group: 'East & North Coast', areas: ['Sangre Grande', 'Valencia', 'Manzanilla', 'Mayaro', 'Toco', 'Blanchisseuse'] },
  { group: 'Tobago', areas: ['Scarborough', 'Crown Point', 'Plymouth', 'Canaan', 'Bon Accord', 'Mount Pleasant', 'Roxborough', 'Speyside', 'Charlotteville'] }
];

// Fills a <select> with every area, grouped. Pass a placeholder to add an empty first option.
window.fillAreaSelect = function (sel, placeholder) {
  sel.innerHTML = '';
  if (placeholder) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = placeholder;
    sel.appendChild(o);
  }
  window.TT_AREAS.forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g.group;
    g.areas.forEach(a => {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
};

// Sets the select's value. If it is an older, typed-in area that isn't in the list,
// it is kept as an extra option so nothing is lost when the form is saved.
window.setAreaValue = function (sel, value) {
  value = String(value || '').trim();
  if (value && !Array.from(sel.options).some(o => o.value === value)) {
    const o = document.createElement('option');
    o.value = value; o.textContent = value;
    sel.insertBefore(o, sel.options[1] || null);
  }
  sel.value = value;
};
