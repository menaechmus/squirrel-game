// Pixel art, drawn in code. Small sprites are text grids (one character per
// pixel, looked up in PALETTE); bigger scenery is generated from simple shapes.

// Repeatable random numbers, so the art and the park are the same every run.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Sprites = (() => {
  const PALETTE = {
    k: '#2b1d16', // outline
    o: '#d0702c', // squirrel fur
    O: '#9c4a1c', // squirrel fur, shaded
    c: '#f1d9b0', // cream belly
    e: '#1a1a1a', // eye
    n: '#e58a8a', // nose
    w: '#ffffff',
    a: '#d59a3c', // acorn
    y: '#f0c670', // acorn highlight
    A: '#6a4322', // acorn cap
    b: '#7a4a2a', // bark
    G: '#2a6e33', // stem
    l: '#6cc04f', // leaf
    r: '#d8453c',
  };

  const GRASS = '#5aa845';
  const GRASS_DARK = '#4c963b';
  const GRASS_LIGHT = '#6cbb52';
  const LEAF = ['#57b34a', '#3f9a3f', '#2a6e33'];   // light, mid, dark
  const PINE = ['#46a060', '#2f7d4f', '#1f5c3d'];
  const BARK = ['#8f5a34', '#7a4a2a', '#55331d'];
  const STONE = ['#c4c4cc', '#9a9aa3', '#6b6b78'];
  const OUTLINE_LEAF = '#173d1c';
  const OUTLINE = '#2b1d16';

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function fromText(rows, overrides) {
    const colors = Object.assign({}, PALETTE, overrides);
    const c = canvas(Math.max(...rows.map((r) => r.length)), rows.length);
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') continue;
        g.fillStyle = colors[row[x]];
        g.fillRect(x, y, 1, 1);
      }
    });
    return c;
  }

  function mirrored(source) {
    const c = canvas(source.width, source.height);
    const g = c.getContext('2d');
    g.scale(-1, 1);
    g.drawImage(source, -source.width, 0);
    return c;
  }

  // Fill every pixel where inside(x, y) is true, with an outline round the edge.
  function paint(g, w, h, inside, colorAt, outline) {
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!at(x, y)) continue;
        const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
        g.fillStyle = edge ? outline : colorAt(x, y);
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  const inCircle = (x, y, cx, cy, r) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r;
  const inEllipse = (x, y, cx, cy, a, b) => ((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy) / b) ** 2 < 1;

  // Light from the top-left: pick light / mid / dark from a 3-colour ramp.
  function shade(ramp, x, y, cx, cy, r, rand) {
    let tone = 1;
    if ((x - cx) + (y - cy) > r * 0.55) tone = 2;
    else if ((x - (cx - r * 0.35)) ** 2 + (y - (cy - r * 0.4)) ** 2 < (r * 0.55) ** 2) tone = 0;
    if (rand() < 0.1) tone = Math.min(2, Math.max(0, tone + (rand() < 0.5 ? -1 : 1)));
    return ramp[tone];
  }

  function trunk(g, w, h, cx, top) {
    paint(g, w, h,
      (x, y) => x >= cx - 3 && x < cx + 3 && y >= top && y < h,
      (x) => BARK[x < cx - 1 ? 0 : x < cx + 1 ? 1 : 2],
      OUTLINE);
  }

  function roundTree(seed, r) {
    const rand = seededRandom(seed);
    const w = r * 2 + 8;
    const h = r * 2 + 14;
    const cx = w / 2;
    const cy = r + 2;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    trunk(g, w, h, cx, cy + r - 4);
    // A main ball of leaves with a few smaller lumps round the bottom.
    const lumps = [];
    for (let i = 0; i < 4; i++) {
      const angle = 0.2 + (i / 3) * (Math.PI - 0.4) + (rand() - 0.5) * 0.3;
      lumps.push({ x: cx + Math.cos(angle) * r * 0.62, y: cy + Math.sin(angle) * r * 0.55, r: r * 0.5 });
    }
    paint(g, w, h,
      (x, y) => inCircle(x, y, cx, cy, r) || lumps.some((b) => inCircle(x, y, b.x, b.y, b.r)),
      (x, y) => shade(LEAF, x, y, cx, cy, r, rand),
      OUTLINE_LEAF);
    return c;
  }

  function pineTree(seed, tiers) {
    const rand = seededRandom(seed);
    const w = 26;
    const tierHeight = 11;
    const h = tiers * 8 + tierHeight + 8;
    const cx = w / 2;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    trunk(g, w, h, cx, h - 10);
    // Stacked triangles, widest at the bottom, drawn bottom-up so they overlap.
    for (let i = tiers - 1; i >= 0; i--) {
      const top = 1 + i * 8;
      const half = 5 + i * 3;
      paint(g, w, h,
        (x, y) => y >= top && y < top + tierHeight
          && Math.abs(x + 0.5 - cx) <= ((y - top + 1) / tierHeight) * half,
        (x, y) => {
          let tone = x + 0.5 < cx - 1 ? 0 : 1;
          if (y >= top + tierHeight - 3 || x + 0.5 > cx + half * 0.4) tone = 2;
          if (rand() < 0.08) tone = 1;
          return PINE[tone];
        },
        OUTLINE_LEAF);
    }
    return c;
  }

  function rock(seed, w, h) {
    const rand = seededRandom(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const cx = w / 2;
    paint(g, w, h,
      (x, y) => inEllipse(x, y, cx, h * 0.62, w / 2, h * 0.62)
        || inEllipse(x, y, cx - w * 0.15, h * 0.5, w * 0.3, h * 0.5),
      (x, y) => shade(STONE, x, y, cx, h * 0.55, w * 0.45, rand),
      OUTLINE);
    return c;
  }

  function bush(seed, berries) {
    const rand = seededRandom(seed);
    const w = 18;
    const h = 13;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    paint(g, w, h,
      (x, y) => inCircle(x, y, 5.5, 8, 5.5) || inCircle(x, y, 9, 6, 6) || inCircle(x, y, 12.5, 8, 5.5),
      (x, y) => (berries && rand() < 0.07 ? PALETTE.r : shade(LEAF, x, y, 9, 7, 7, rand)),
      OUTLINE_LEAF);
    return c;
  }

  function stump() {
    const w = 14;
    const h = 12;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const top = (x, y) => inEllipse(x, y, 7, 4, 7, 4);
    paint(g, w, h,
      (x, y) => top(x, y) || (y >= 4 && y < 9) || inEllipse(x, y, 7, 8.5, 7, 3.5),
      (x, y) => {
        if (!top(x, y)) return BARK[x % 3 === 0 ? 2 : 1];
        const ring = ((x + 0.5 - 7) / 7) ** 2 + ((y + 0.5 - 4) / 4) ** 2;
        return ring > 0.2 && ring < 0.45 ? '#c79f66' : '#e2c391';
      },
      OUTLINE);
    return c;
  }

  function shadow(w, h) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inEllipse(x, y, w / 2, h / 2, w / 2, h / 2)) g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  const squirrelRight = fromText([
    '................',
    '................',
    '..kkkk..........',
    '.kOoook....k.k..',
    'kOoooook..kokok.',
    'kOooooook.koook.',
    'kOoooooOkkoooook',
    'kOooooOkoooeoook',
    '.kOoooOkoooooonk',
    '.kOooOkooooocck.',
    '..kOoOkoooocck..',
    '..kOOkoooccck...',
    '...kkoooccok....',
    '....kookkook....',
    '....kkk..kkk....',
    '................',
  ]);

  const squirrelDown = fromText([
    '................',
    '....k......k....',
    '...kok....kok...',
    '...kookkkkook...',
    '..kooooooooook..',
    '..koeooooooeok..',
    '..kooccnnccook..',
    '...koccccccok...',
    '...kooccccookOk.',
    '..kooccccccookOk',
    '..kooccccccookOk',
    '..kooccccccookk.',
    '...kooccccook...',
    '...kOokkkkoOk...',
    '....kk....kk....',
    '................',
  ]);

  const squirrelUp = fromText([
    '................',
    '....k......k....',
    '...kok....kok...',
    '...kookkkkook...',
    '..kooooooooook..',
    '..kooooooooook..',
    '..kooooooooook..',
    '...kooooooook...',
    '...kooOOOOook...',
    '..kooOOooOOook..',
    '..kooOooooOook..',
    '..kooOOooOOook..',
    '...kooOOOOook...',
    '...kOokkkkoOk...',
    '....kk....kk....',
    '................',
  ]);

  const acorn = fromText([
    '...kk...',
    '...kb...',
    '.kAAAAk.',
    'kAAAAAAk',
    'kAAAAAAk',
    '.kayaak.',
    '.kayaak.',
    '.kaaaak.',
    '..kaak..',
    '...kk...',
  ]);

  const FLOWER = [
    '..F..',
    '.FyF.',
    '..F..',
    '..G..',
    '.lG..',
    '..Gl.',
  ];

  const mushroom = fromText([
    '..kkk..',
    '.krrrk.',
    'krwrrrk',
    'krrrwrk',
    '.kccck.',
    '..kck..',
    '..kkk..',
  ]);

  const props = {
    tree0: roundTree(11, 13),
    tree1: roundTree(12, 15),
    tree2: roundTree(13, 11),
    pine0: pineTree(21, 4),
    pine1: pineTree(22, 3),
    rock0: rock(31, 20, 14),
    rock1: rock(32, 16, 11),
    stump: stump(),
    bush0: bush(41, false),
    bush1: bush(42, true),
    flowerRed: fromText(FLOWER, { F: '#e2504a' }),
    flowerYellow: fromText(FLOWER, { F: '#f4d24a', y: '#ffffff' }),
    flowerPurple: fromText(FLOWER, { F: '#a879e0' }),
    mushroom,
  };

  // Soft shadow sizes baked into the ground under each kind of scenery.
  const GROUND_SHADOWS = { tree: [24, 8], pine: [20, 7], rock: [22, 6], stump: [16, 5], bush: [18, 5] };

  // The whole park floor, drawn once: grass, pond, scenery shadows and the hedge.
  function buildGround(level) {
    const rand = seededRandom(7);
    const size = level.size;
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const dot = (x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); };

    g.fillStyle = GRASS;
    g.fillRect(0, 0, size, size);
    for (let ty = 0; ty < size; ty += level.tile) {
      for (let tx = 0; tx < size; tx += level.tile) {
        for (let i = 0; i < 4; i++) {
          dot(tx + Math.floor(rand() * 16), ty + Math.floor(rand() * 16), rand() < 0.5 ? GRASS_DARK : GRASS_LIGHT);
        }
        if (rand() < 0.3) {
          // A little tuft of grass blades.
          const x = tx + 3 + Math.floor(rand() * 10);
          const y = ty + 3 + Math.floor(rand() * 10);
          dot(x, y, GRASS_DARK);
          dot(x + 1, y - 1, GRASS_DARK);
          dot(x + 2, y, GRASS_DARK);
          dot(x + 1, y, GRASS_LIGHT);
        }
      }
    }

    const pond = level.pond;
    for (let y = Math.floor(pond.y - pond.b - 6); y < pond.y + pond.b + 6; y++) {
      for (let x = Math.floor(pond.x - pond.a - 6); x < pond.x + pond.a + 6; x++) {
        const angle = Math.atan2(y - pond.y, x - pond.x);
        const n = (((x - pond.x) / pond.a) ** 2 + ((y - pond.y) / pond.b) ** 2) * (1 + 0.05 * Math.sin(angle * 6));
        if (n < 0.82) dot(x, y, rand() < 0.03 ? '#8cc4f0' : '#4a90d9');
        else if (n < 1) dot(x, y, '#6fb0e8');
        else if (n < 1.1) dot(x, y, '#3a7a32');
      }
    }

    for (const prop of level.props) {
      const kind = Object.keys(GROUND_SHADOWS).find((name) => prop.sprite.startsWith(name));
      if (!kind) continue;
      const [w, h] = GROUND_SHADOWS[kind];
      g.drawImage(shadow(w, h), Math.round(prop.x - w / 2), Math.round(prop.y - h / 2 - 1));
    }

    const border = level.border;
    const inner = size - border;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x >= border && x < inner && y >= border && y < inner) {
          x = inner - 1; // skip the inside of the park
          continue;
        }
        const onEdge = (x === border - 1 || x === inner) && y >= border - 1 && y <= inner
          || (y === border - 1 || y === inner) && x >= border - 1 && x <= inner;
        const roll = rand();
        dot(x, y, onEdge ? OUTLINE_LEAF : roll < 0.18 ? LEAF[1] : roll < 0.3 ? '#1f5226' : LEAF[2]);
      }
    }
    // The top hedge casts a little shade into the park.
    g.fillStyle = 'rgba(0, 0, 0, 0.18)';
    g.fillRect(border, border, inner - border, 3);
    return c;
  }

  return {
    squirrel: { right: squirrelRight, left: mirrored(squirrelRight), down: squirrelDown, up: squirrelUp },
    acorn,
    shadowSmall: shadow(10, 4),
    props,
    buildGround,
  };
})();
