/* What the shoe is made of, what it costs, and what cannot be combined.
 *
 * This is the single source of truth. The 3D materials, the option sheet, the
 * running total and the shareable URL all read from here, so adding an option
 * means editing this file only. */
window.MarloweCatalogue = (function () {
  'use strict';

  var BASE = 420;

  /* Each leather is a set of surface properties, not just a colour.
   *   rough / ns   roughness and normal-map strength
   *   cc / ccr     clearcoat amount and its roughness, which is what makes
   *                polished calf and cordovan look wet rather than matte
   *   rep          how many times the grain tiles across the shoe
   *   sheen        grazing-angle lift, used only for suede nap
   *   bump / rlo   inputs to the generated normal and roughness maps */
  var LEATHER = {
    calf:     { label: 'Polished calf',  price: 0,   rough: 0.30, ns: 0.40, cc: 0.62, ccr: 0.08, rep: 5.0, sheen: 0,    bump: 2.6, rlo: 0.55 },
    suede:    { label: 'Suede',          price: 30,  rough: 0.97, ns: 1.05, cc: 0.00, ccr: 0.60, rep: 9.0, sheen: 0.62, bump: 5.5, rlo: 0.88 },
    pebble:   { label: 'Pebble grain',   price: 45,  rough: 0.58, ns: 1.40, cc: 0.20, ccr: 0.32, rep: 4.2, sheen: 0,    bump: 8.0, rlo: 0.72 },
    cordovan: { label: 'Shell cordovan', price: 290, rough: 0.20, ns: 0.28, cc: 0.88, ccr: 0.05, rep: 2.2, sheen: 0,    bump: 1.8, rlo: 0.62 }
  };

  /* [name, what it is, hex]. The palette depends on the leather: cordovan
     really does only come in three shades, and suede takes no black. */
  var COLOURS = {
    calf: [
      ['Black',      'the standard for evening',   0x101115],
      ['Dark oak',   'warm brown, ages well',      0x3A2317],
      ['Chestnut',   'mid brown with red in it',   0x6B3D22],
      ['Oxblood',    'deep burgundy',              0x4A1C22],
      ['Navy',       'reads near-black in low light', 0x1E2A3D]
    ],
    suede: [
      ['Tobacco',    'dry warm brown',  0x7A5233],
      ['Stone',      'pale grey-beige', 0x9C9184],
      ['Slate',      'cool mid grey',   0x4D5158],
      ['Dark olive', 'muted green',     0x4A4B34]
    ],
    pebble: [
      ['Black',    'the grain still holds polish', 0x1B1B1D],
      ['Dark oak', 'warm brown',                   0x3D2718],
      ['Chestnut', 'mid brown',                    0x6E4126]
    ],
    cordovan: [
      ['Colour 8', 'the classic shell burgundy', 0x5C2029],
      ['Black',    'rare in shell',              0x1A1517],
      ['Colour 4', 'light russet',               0x8A4A2A]
    ]
  };

  /* [key, label, price delta] */
  var CAPS  = [['match', 'Matching leather', 0], ['contrast', 'Black contrast cap', 60]];
  var SOLES = [['leather', 'Oak-bark leather', 0], ['dainite', 'Dainite rubber', 35]];
  var EDGES = [['dark', 'Dark edge', 0], ['natural', 'Natural edge', 0]];
  var LACES = [['black', 'Black waxed cotton', 0], ['tonal', 'Tonal, matched to upper', 0], ['natural', 'Undyed cotton', 8]];
  var EYES  = [['black', 'Blackened', 0], ['brass', 'Antique brass', 18], ['nickel', 'Nickel', 18]];

  var MONOGRAM_PRICE = 40;

  var DEFAULTS = {
    leather: 'calf', colour: 0, cap: 'match', sole: 'leather',
    edge: 'dark', lace: 'black', eye: 'black', mono: ''
  };

  function find(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === key) return list[i];
    return list[0];
  }

  function total(s) {
    return BASE
      + LEATHER[s.leather].price
      + find(CAPS, s.cap)[2]
      + find(SOLES, s.sole)[2]
      + find(LACES, s.lace)[2]
      + find(EYES, s.eye)[2]
      + (s.mono.trim() ? MONOGRAM_PRICE : 0);
  }

  function money(n) { return '£' + n.toLocaleString('en-GB'); }
  function delta(n) { return n ? ('+' + money(n)) : 'Included'; }

  /* A build packs into the URL hash so a specific pair can be linked to. */
  var ORDER = ['leather', 'colour', 'cap', 'sole', 'edge', 'lace', 'eye', 'mono'];

  function encode(s) {
    return ORDER.map(function (k) { return String(s[k]); }).join('.');
  }

  function decode(str) {
    var s = Object.assign({}, DEFAULTS);
    if (!str) return s;
    var p = str.split('.');
    if (p.length < ORDER.length - 1) return s;
    if (LEATHER[p[0]]) s.leather = p[0];
    var c = parseInt(p[1], 10);
    s.colour = (isFinite(c) && c >= 0 && c < COLOURS[s.leather].length) ? c : 0;
    s.cap  = find(CAPS,  p[2])[0];
    s.sole = find(SOLES, p[3])[0];
    s.edge = find(EDGES, p[4])[0];
    s.lace = find(LACES, p[5])[0];
    s.eye  = find(EYES,  p[6])[0];
    s.mono = (p[7] || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    return s;
  }

  return {
    BASE: BASE, LEATHER: LEATHER, COLOURS: COLOURS,
    CAPS: CAPS, SOLES: SOLES, EDGES: EDGES, LACES: LACES, EYES: EYES,
    MONOGRAM_PRICE: MONOGRAM_PRICE, DEFAULTS: DEFAULTS,
    find: find, total: total, money: money, delta: delta,
    encode: encode, decode: decode
  };
})();
