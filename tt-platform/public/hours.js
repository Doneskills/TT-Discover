// Short opening-hours text, e.g.  "Mon, Sun: Closed · Tue: 5pm – 1am · Wed – Sat: 9am – 4pm"
// Days with the same hours are joined together; runs of 3+ days become a range.
(function () {
  var ORDER = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  function fmt12(t) {
    if (!t) return '';
    var p = String(t).split(':'), h = Number(p[0]), m = Number(p[1] || 0);
    if (isNaN(h)) return '';
    return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : '') + (h >= 12 && h < 24 ? 'pm' : 'am');
  }
  function dayLabel(idxs) {
    var parts = [], i = 0;
    while (i < idxs.length) {
      var j = i;
      while (j + 1 < idxs.length && idxs[j + 1] === idxs[j] + 1) j++;
      var run = j - i + 1;
      if (run >= 3) parts.push(ORDER[idxs[i]][1] + ' – ' + ORDER[idxs[j]][1]);
      else for (var k = i; k <= j; k++) parts.push(ORDER[idxs[k]][1]);
      i = j + 1;
    }
    return parts.join(', ');
  }
  window.ttFmt12 = fmt12;
  window.ttCompactHours = function (h) {
    if (!h) return '';
    if (typeof h === 'string') return h;
    var groups = [], byText = {};
    ORDER.forEach(function (d, idx) {
      var st = h[d[0]];
      if (!st) return;
      var text = st.closed ? 'Closed' : fmt12(st.open) + ' – ' + fmt12(st.close);
      if (!(text in byText)) { byText[text] = { text: text, days: [] }; groups.push(byText[text]); }
      byText[text].days.push(idx);
    });
    return groups.map(function (g) { return dayLabel(g.days) + ': ' + g.text; }).join(' · ');
  };
})();
