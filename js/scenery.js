// Scenery generated from simple shapes: trees, rocks, bushes, the ground, the
// pond and cloud shadows. Everything is drawn once at start-up into small
// off-screen canvases; movement comes from switching between pre-drawn frames.

const Scenery = (() => {
  const { canvas } = Sprites;
  const TAU = Math.PI * 2;

  // Colour ramps run from sunlit to deep shade.
  const RAMPS = {
    leaf: ['#93d65c', '#64b94a', '#409a40', '#2d7a37', '#1f5a2d'],
    birch: ['#cdea72', '#a3d65a', '#78bb48', '#519c3e', '#377c35'],
    maple: ['#ffc64f', '#f59c30', '#e06c24', '#b84a1e', '#8a321a'],
    red: ['#ff9a5a', '#ee6a3c', '#d2472e', '#a83226', '#7c2420'],
    apple: ['#8fd06a', '#5fb352', '#3c9446', '#2a753c', '#1c5630'],
    pine: ['#6cbf6a', '#46a060', '#2f7d4f', '#1f5c3d', '#153f2c'],
    spruce: ['#78c0aa', '#469a80', '#2c7a66', '#1e5e50', '#14423a'],
    moss: ['#a6d860', '#7fbe4a', '#5c9e3e', '#437e36', '#2f5f2c'],
    bark: ['#a8703f', '#8f5a34', '#7a4a2a', '#5f3920', '#452816'],
    birchBark: ['#fbf8ee', '#e9e5d6', '#cfcab8', '#aaa593', '#857f6e'],
    deadBark: ['#b9a58c', '#9a8770', '#7d6c58', '#5f5142', '#453a2f'],
    granite: ['#e0e0e6', '#bdbdc6', '#9a9aa5', '#77778a', '#585866'],
    sandstone: ['#ead8b6', '#d2ba92', '#b49a70', '#8f7652', '#6c583e'],
    basalt: ['#b8bcc4', '#9096a0', '#6e7480', '#525864', '#3c404a'],
  };
  const GRASS = ['#66b54c', '#5cab46', '#539f41', '#4a933b'];
  const HEDGE = ['#3f9a3f', '#2f7d36', '#2a6e33', '#1f5226'];
  const OUTLINE = { leaf: '#143a1d', autumn: '#5a1d10', bark: '#2b1d16', birch: '#5d5648', stone: '#2b2b33', sand: '#3a2e20' };
  const CLOUD_SHADE = ['#0f1a3a10', '#0f1a3a20', '#0f1a3a30'];   // dark blue, fading in to about 19% strength
  const TREE_LEANS = [-1, 0, 1, 2];  // sway frames: how hard the wind is pushing

  // ---- helpers ----

  const inCircle = (x, y, cx, cy, r) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r;
  const inEllipse = (x, y, cx, cy, a, b) => ((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy) / b) ** 2 < 1;
  const inRounded = (x, y, cx, cy, a, b, power) =>
    Math.abs((x + 0.5 - cx) / a) ** power + Math.abs((y + 0.5 - cy) / b) ** power < 1;

  // Pick a colour from a ramp for a shade from 0 (lit) to 1 (dark). Between two
  // neighbouring colours it dithers in a checkerboard, the classic pixel-art blend.
  function tone(ramp, shade, x, y, dither = true) {
    const scaled = Math.min(0.999, Math.max(0, shade)) * (ramp.length - 1);
    const low = Math.floor(scaled);
    const part = scaled - low;
    const up = dither ? part > 0.66 || (part > 0.33 && (x + y) % 2 === 0) : part > 0.5;
    return ramp[low + (up ? 1 : 0)];
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

  // Build a big image quickly: colorAt returns '#rrggbb', '#rrggbbaa' or null (clear).
  const parsedColors = {};
  function pixelCanvas(w, h, colorAt) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const image = g.createImageData(w, h);
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const color = colorAt(x, y);
        if (!color) continue;
        const parts = parsedColors[color] || (parsedColors[color] = [
          parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16),
          color.length > 7 ? parseInt(color.slice(7, 9), 16) : 255,
        ]);
        image.data[i] = parts[0];
        image.data[i + 1] = parts[1];
        image.data[i + 2] = parts[2];
        image.data[i + 3] = parts[3];
      }
    }
    g.putImageData(image, 0, 0);
    return c;
  }

  // Repeatable noise: hash() is speckle, smoothNoise() is soft blobs `cell` pixels across.
  function hash(x, y, seed) {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function smoothNoise(x, y, cell, seed) {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
    const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
    const top = hash(ix, iy, seed) + (hash(ix + 1, iy, seed) - hash(ix, iy, seed)) * sx;
    const bottom = hash(ix, iy + 1, seed) + (hash(ix + 1, iy + 1, seed) - hash(ix, iy + 1, seed)) * sx;
    return top + (bottom - top) * sy;
  }

  // Wind frames: the `moving` layer leans over the `still` one. Rows further
  // above the pivot shift further, so tree tops sway while trunks stay put.
  function swayFrames(still, moving, leans, pivotY, strength) {
    return leans.map((lean) => {
      const c = canvas(still.width, still.height);
      const g = c.getContext('2d');
      g.drawImage(still, 0, 0);
      for (let y = 0; y < moving.height; y++) {
        const shift = Math.round(lean * strength * Math.max(0, (pivotY - y) / pivotY));
        g.drawImage(moving, 0, y, moving.width, 1, shift, y, moving.width, 1);
      }
      return c;
    });
  }

  function padded(sprite, margin) {
    const c = canvas(sprite.width + margin * 2, sprite.height);
    c.getContext('2d').drawImage(sprite, margin, 0);
    return c;
  }

  function line(g, x0, y0, x1, y1, color, fat) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.fillStyle = color;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      if (fat) g.fillRect(x - 1, y - 1, 3, 3);
      else g.fillRect(x, y, 1, 1);
    }
  }

  // ---- trees ----

  // A canopy is a pile of round leaf clumps, each lit from the top-left, so it
  // reads as bunches of leaves rather than one smooth ball.
  function canopy(g, w, h, cx, cy, rx, ry, ramp, outline, rand) {
    const small = Math.min(rx, ry);
    const clumps = [{ x: cx, y: cy, r: small * 0.8 }];
    // A ring of clumps keeps the outline full; the rest fill the middle at random.
    const ring = Math.max(8, Math.round((rx + ry) * 0.42));
    for (let i = 0; i < ring; i++) {
      const angle = (i / ring) * TAU + rand() * 0.4;
      const r = small * (0.32 + rand() * 0.12);
      clumps.push({ x: cx + Math.cos(angle) * (rx - r), y: cy + Math.sin(angle) * (ry - r), r });
    }
    for (let i = 0; i < ring; i++) {
      const angle = rand() * TAU;
      const reach = Math.sqrt(rand()) * 0.6;
      clumps.push({ x: cx + Math.cos(angle) * rx * reach, y: cy + Math.sin(angle) * ry * reach, r: small * (0.28 + rand() * 0.14) });
    }
    // Clumps lower down and to the right sit in front.
    clumps.sort((a, b) => (a.y + a.x * 0.4) - (b.y + b.x * 0.4));
    const owner = (x, y) => {
      for (let i = clumps.length - 1; i >= 0; i--) {
        if (inCircle(x, y, clumps[i].x, clumps[i].y, clumps[i].r)) return i;
      }
      return -1;
    };
    paint(g, w, h, (x, y) => owner(x, y) >= 0, (x, y) => {
      const index = owner(x, y);
      const clump = clumps[index];
      const within = ((x + 0.5 - clump.x) + (y + 0.5 - clump.y)) / (clump.r * 2);
      const overall = ((x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry) / 2;
      let shade = 0.48 + within * 0.42 + overall * 0.5 + (rand() - 0.5) * 0.1;
      if (owner(x + 1, y + 1) > index) shade += 0.16;   // tucked under the clump in front
      return tone(ramp, shade, x, y);
    }, outline);
  }

  function trunk(g, w, h, cx, top, girth, ramp, style, outline) {
    const inside = (x, y) => {
      if (y < top) return false;
      const flare = y >= h - 2 ? 1 : 0;   // roots spread at the base
      return x >= cx - girth - flare && x < cx + girth + flare;
    };
    paint(g, w, h, inside, (x, y) => {
      let shade = 0.12 + ((x - (cx - girth)) / (girth * 2 - 1)) * 0.7;
      if (style === 'birch') {
        // Dark flecks across pale bark.
        if ((y % 4 === 1 && x < cx) || (y % 4 === 3 && x >= cx)) return '#3a332c';
        return tone(ramp, shade * 0.7, x, y, false);
      }
      if (x % 2 === 0 && (y + x * 5) % 7 < 4) shade += 0.22;   // grooves in the bark
      return tone(ramp, shade, x, y, false);
    }, outline);
  }

  function broadleaf(spec) {
    const rand = seededRandom(spec.seed);
    const margin = 4;   // room for the canopy to lean into
    const w = spec.rx * 2 + margin * 2;
    const cx = w / 2;
    const cy = spec.ry + 1;
    const h = cy + spec.ry + spec.trunk;
    const still = canvas(w, h);
    const moving = canvas(w, h);
    trunk(still.getContext('2d'), w, h, cx, cy + Math.floor(spec.ry * 0.4), spec.girth,
      spec.bark || RAMPS.bark, spec.barkStyle, spec.barkStyle === 'birch' ? OUTLINE.birch : OUTLINE.bark);
    const g = moving.getContext('2d');
    canopy(g, w, h, cx, cy, spec.rx, spec.ry, spec.ramp, spec.outline || OUTLINE.leaf, rand);
    for (let i = 0; i < (spec.fruit || 0); i++) {
      const angle = rand() * TAU;
      const reach = 0.25 + rand() * 0.5;
      const x = Math.round(cx + Math.cos(angle) * spec.rx * reach);
      const y = Math.round(cy + Math.sin(angle) * spec.ry * reach);
      g.fillStyle = '#c92f2a';
      g.fillRect(x, y, 2, 2);
      g.fillStyle = '#ff8f7a';
      g.fillRect(x, y, 1, 1);
    }
    return swayFrames(still, moving, TREE_LEANS, cy + spec.ry, 1.3);
  }

  function conifer(spec) {
    const rand = seededRandom(spec.seed);
    const tierHeight = 11;
    const step = 7;
    const widest = Math.ceil(spec.base + (spec.tiers - 1) * spec.spread);
    const w = widest * 2 + 8;
    const h = 1 + (spec.tiers - 1) * step + tierHeight + 7;
    const cx = w / 2;
    const still = canvas(w, h);
    const moving = canvas(w, h);
    trunk(still.getContext('2d'), w, h, cx, h - 10, 2, RAMPS.bark, null, OUTLINE.bark);
    const g = moving.getContext('2d');
    // Stacked skirts of needles, widest at the bottom, drawn bottom-up so they overlap.
    for (let i = spec.tiers - 1; i >= 0; i--) {
      const top = 1 + i * step;
      const half = spec.base + i * spec.spread;
      paint(g, w, h,
        (x, y) => {
          if (y < top || y >= top + tierHeight) return false;
          if (y === top + tierHeight - 1 && (x + i) % 3 === 0) return false;   // ragged lower edge
          return Math.abs(x + 0.5 - cx) <= ((y - top + 1) / tierHeight) * half;
        },
        (x, y) => {
          const across = (x + 0.5 - cx) / half;
          const down = (y - top) / tierHeight;
          let shade = 0.42 + across * 0.38 + (down - 0.5) * 0.45 + (rand() - 0.5) * 0.12;
          if ((x * 3 + y * 5) % 7 === 0) shade -= 0.2;   // needle highlights
          return tone(spec.ramp, shade, x, y);
        },
        OUTLINE.leaf);
    }
    return swayFrames(still, moving, TREE_LEANS, h - 8, 1.2);
  }

  function deadTree() {
    const w = 30;
    const h = 36;
    const cx = 15;
    const still = canvas(w, h);
    const moving = canvas(w, h);
    trunk(still.getContext('2d'), w, h, cx, 14, 2, RAMPS.deadBark, null, OUTLINE.bark);
    const g = moving.getContext('2d');
    const branches = [
      [cx - 1, 18, cx - 8, 8], [cx - 5, 12, cx - 10, 5], [cx, 16, cx + 8, 7],
      [cx + 5, 10, cx + 10, 5], [cx, 15, cx + 1, 3], [cx + 1, 8, cx - 3, 2],
    ];
    // Each branch is drawn fat and dark first, then the wood on top, to outline it.
    for (const [x0, y0, x1, y1] of branches) line(g, x0, y0, x1, y1, OUTLINE.bark, true);
    for (const [x0, y0, x1, y1] of branches) line(g, x0, y0, x1, y1, RAMPS.deadBark[1], false);
    return swayFrames(still, moving, TREE_LEANS, 18, 0.8);
  }

  // ---- rocks, bushes, small plants ----

  function rock(spec) {
    const rand = seededRandom(spec.seed);
    const { w, h, ramp, shape } = spec;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    // Flat faces at slightly different angles, like a chipped stone.
    const facets = [];
    for (let i = 0; i < spec.facets; i++) {
      facets.push({ x: rand() * w, y: rand() * h, shift: (rand() - 0.5) * 0.3 });
    }
    const facetAt = (x, y) => {
      let best = 0;
      for (let i = 1; i < facets.length; i++) {
        if ((x - facets[i].x) ** 2 + (y - facets[i].y) ** 2 < (x - facets[best].x) ** 2 + (y - facets[best].y) ** 2) best = i;
      }
      return best;
    };
    const mossLine = (x) => h * spec.moss + Math.sin(x * 0.9 + spec.seed) * 1.5;
    paint(g, w, h, shape, (x, y) => {
      const facet = facetAt(x, y);
      let shade = 0.5 + ((x - w / 2) / w + (y - h / 2) / h) * 0.8 + facets[facet].shift;
      if (facetAt(x + 1, y + 1) !== facet) shade += 0.2;         // crease where two faces meet
      else if (facetAt(x - 1, y - 1) !== facet) shade -= 0.14;   // and a lit edge beside it
      if (spec.moss && y < mossLine(x)) return tone(RAMPS.moss, shade + (rand() - 0.5) * 0.2, x, y);
      if (rand() < (spec.speckle || 0)) shade += rand() < 0.5 ? -0.25 : 0.25;
      return tone(ramp, shade, x, y);
    }, spec.outline || OUTLINE.stone);

    const interior = (x, y) => shape(x, y) && shape(x - 1, y) && shape(x + 1, y) && shape(x, y - 1) && shape(x, y + 1) && y < h - 1;
    g.fillStyle = ramp[4];
    for (let i = 0; i < (spec.cracks || 0); i++) {
      let x = Math.round(w * (0.3 + rand() * 0.4));
      for (let y = 1; y < h; y++) {
        if (interior(x, y)) g.fillRect(x, y, 1, 1);
        x += Math.floor(rand() * 3) - 1;
      }
    }
    return [c];
  }

  const boulder = (w, h) => (x, y) => inEllipse(x, y, w / 2, h * 0.62, w / 2, h * 0.62)
    || inEllipse(x, y, w * 0.35, h * 0.5, w * 0.3, h * 0.5);

  function bush(seed, ramp, berries) {
    const rand = seededRandom(seed);
    const w = 24;
    const h = 15;
    const moving = canvas(w, h);
    const g = moving.getContext('2d');
    canopy(g, w, h, 12, 8, 8, 6, ramp, OUTLINE.leaf, rand);
    for (let i = 0; i < berries; i++) {
      const angle = rand() * TAU;
      g.fillStyle = '#e2504a';
      g.fillRect(Math.round(12 + Math.cos(angle) * 5 * rand()), Math.round(8 + Math.sin(angle) * 3.5 * rand()), 1, 1);
    }
    return swayFrames(canvas(w, h), moving, [0, 1], 14, 1);
  }

  function stump() {
    const w = 16;
    const h = 13;
    const c = canvas(w, h);
    const top = (x, y) => inEllipse(x, y, 8, 4.5, 8, 4.5);
    paint(c.getContext('2d'), w, h,
      (x, y) => top(x, y) || (y >= 4 && y < 10) || inEllipse(x, y, 8, 9.5, 8, 3.5),
      (x, y) => {
        if (top(x, y)) {
          const ring = ((x + 0.5 - 8) / 8) ** 2 + ((y + 0.5 - 4.5) / 4.5) ** 2;
          return ring > 0.6 || (ring > 0.2 && ring < 0.36) ? '#c79f66' : '#e6c996';
        }
        return tone(RAMPS.bark, 0.2 + (x / w) * 0.6 + (x % 3 === 0 ? 0.25 : 0), x, y, false);
      },
      OUTLINE.bark);
    return [c];
  }

  // A tuft of grass blades, bent over by `lean` pixels at the tips.
  function tuft(lean) {
    const c = canvas(9, 6);
    const g = c.getContext('2d');
    for (const [base, height] of [[1, 3], [3, 5], [5, 6], [6, 4]]) {
      for (let k = 0; k < height; k++) {
        g.fillStyle = k < 2 ? '#2f7a30' : k < height - 1 ? '#3f9438' : '#a4e070';
        g.fillRect(base + Math.round(lean * (k / (height - 1)) ** 1.5), 5 - k, 1, 1);
      }
    }
    return c;
  }

  // ---- logs and the rocky hill ----

  function flipped(sprite) {
    const c = canvas(sprite.width, sprite.height);
    const g = c.getContext('2d');
    g.scale(-1, 1);
    g.drawImage(sprite, -sprite.width, 0);
    return c;
  }

  // A fallen log lying across the screen, its sawn end, ringed, to the right.
  function fallenLog(length, seed, moss) {
    const h = 11;
    const c = canvas(length, h);
    const endX = length - 4.5;   // middle of the sawn end
    const inEnd = (x, y) => inEllipse(x, y, endX, h / 2, 3.5, h / 2 - 0.5);
    // The far end is rounded off where it broke from its stump.
    const inBody = (x, y) => x >= 1 && x < endX && y >= 1 && y < h - 1 && !(x < 3 && (y < 3 || y > h - 4));
    paint(c.getContext('2d'), length, h, (x, y) => inBody(x, y) || inEnd(x, y), (x, y) => {
      if (inEnd(x, y)) {
        const ring = Math.hypot((x + 0.5 - endX) / 3.5, (y + 0.5 - h / 2) / (h / 2 - 0.5));
        return ring > 0.78 ? '#8f6a3f' : ring > 0.42 && ring < 0.6 ? '#c49a5e' : '#e6c690';
      }
      let shade = 0.12 + (y / (h - 1)) * 0.78;
      if ((x * 7 + Math.floor(y / 2) * 3) % 6 === 0) shade += 0.22;   // furrows in the bark
      if (moss && y < 5 && smoothNoise(x, y, 4, seed) > 0.52) return tone(RAMPS.moss, shade, x, y);
      return tone(RAMPS.bark, shade, x, y, false);
    }, OUTLINE.bark);
    return c;
  }

  // The rocky hill: a pile of craggy boulders, the tallest at the back, mossy
  // on top, with a cleft between two in front where a spring comes down. The
  // waterfall is a prop of its own ('falls'), drawn over the cleft.
  const HILL = { w: 132, h: 92, fallsX: -18, fallsTop: 30 };
  function rockyHill() {
    const { w, h } = HILL;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    // Each boulder: left, top, width, height, rock, how much moss on top. Back row first.
    const boulders = [
      [38, 2, 52, 62, RAMPS.basalt, 0.3], [76, 16, 42, 50, RAMPS.granite, 0.32], [12, 22, 38, 46, RAMPS.granite, 0.3],
      [96, 40, 34, 36, RAMPS.basalt, 0.34], [0, 46, 44, 38, RAMPS.basalt, 0.32],
      [62, 50, 46, 34, RAMPS.granite, 0.3], [4, 62, 38, 30, RAMPS.granite, 0.22], [54, 60, 52, 32, RAMPS.basalt, 0.2], [100, 66, 32, 26, RAMPS.granite, 0.25],
    ];
    boulders.forEach(([left, top, bw, bh, ramp, moss], index) => {
      const [piece] = rock({ seed: 401 + index, w: bw, h: bh, ramp, shape: boulder(bw, bh), facets: 6 + (bw >> 3), speckle: 0.06, moss, cracks: bw > 40 ? 2 : 1 });
      g.drawImage(piece, left, top);
    });
    // The cleft, in deep shade, from the spring down to the foot of the hill.
    const middle = (w >> 1) + HILL.fallsX;
    const pixels = g.getImageData(0, 0, w, h).data;
    for (let y = HILL.fallsTop - 2; y < h; y++) {
      if (!pixels[(middle + y * w) * 4 + 3]) continue;
      g.fillStyle = OUTLINE.stone;
      g.fillRect(middle - 4, y, 9, 1);
      g.fillStyle = RAMPS.basalt[4];
      g.fillRect(middle - 3, y, 7, 1);
    }
    return [c];
  }

  // The waterfall down the cleft, in four frames: streaks of light running
  // down, foam where it lands.
  function waterfall() {
    const w = 7;
    const h = HILL.h - HILL.fallsTop + 3;
    const frames = [];
    for (let f = 0; f < 4; f++) {
      frames.push(pixelCanvas(w, h, (x, y) => {
        if (x === 0 || x === w - 1) return y > 1 && y < h - 3 ? '#3a7ec6' : null;
        if (y >= h - 4) return (x + y + f) % 3 === 0 ? '#86c2f2' : '#ffffff';   // foam
        const streak = (y - f * 4 + x * 5) % 9;
        if (streak < 3) return '#d4eeff';
        return x === 1 || x === w - 2 ? '#4a90d9' : '#62a6e6';
      }));
    }
    return frames;
  }

  // ---- the catalogue ----

  // Where a bird could sit on a tree: the middle of the top row of a frame, as
  // pixels right of the trunk line (x) and above the base (y).
  function crownTop(frame) {
    const { width, height } = frame;
    const pixels = frame.getContext('2d').getImageData(0, 0, width, height).data;
    for (let y = 0; y < height; y++) {
      let first = -1;
      let last = -1;
      for (let x = 0; x < width; x++) {
        if (pixels[(x + y * width) * 4 + 3] === 0) continue;
        if (first < 0) first = x;
        last = x;
      }
      if (first >= 0) return { x: Math.round((first + last + 1) / 2) - (width >> 1), y: height - y };
    }
    return { x: 0, y: height };
  }

  // Each entry: frames to draw, which frame is "no wind" (rest), how strongly it
  // answers the wind (gain), its ground shadow, whether its top can hide things,
  // whether a bird can perch on it (then `tops` is its crown top in each
  // frame), and the colour of leaves it sheds in a gust.
  const props = {};
  function define(name, frames, options) {
    props[name] = Object.assign({ frames, rest: 0, gain: 0 }, options);
    if (props[name].perch) props[name].tops = frames.map(crownTop);
  }
  const TREE = { rest: 1, gain: 1, hides: true, perch: true };

  define('oak0', broadleaf({ seed: 101, rx: 19, ry: 14, trunk: 9, girth: 4, ramp: RAMPS.leaf }), { ...TREE, shadow: [34, 10], leaves: RAMPS.leaf[1] });
  define('oak1', broadleaf({ seed: 102, rx: 17, ry: 13, trunk: 8, girth: 4, ramp: RAMPS.leaf }), { ...TREE, shadow: [30, 9], leaves: RAMPS.leaf[1] });
  define('elm0', broadleaf({ seed: 111, rx: 13, ry: 12, trunk: 9, girth: 3, ramp: RAMPS.leaf }), { ...TREE, shadow: [24, 8], leaves: RAMPS.leaf[1] });
  define('elm1', broadleaf({ seed: 112, rx: 11, ry: 11, trunk: 8, girth: 3, ramp: RAMPS.apple }), { ...TREE, shadow: [22, 7], leaves: RAMPS.apple[1] });
  define('birch0', broadleaf({ seed: 121, rx: 9, ry: 12, trunk: 13, girth: 2, ramp: RAMPS.birch, bark: RAMPS.birchBark, barkStyle: 'birch' }), { ...TREE, shadow: [18, 6], leaves: RAMPS.birch[0] });
  define('birch1', broadleaf({ seed: 122, rx: 8, ry: 10, trunk: 12, girth: 2, ramp: RAMPS.birch, bark: RAMPS.birchBark, barkStyle: 'birch' }), { ...TREE, shadow: [16, 6], leaves: RAMPS.birch[0] });
  define('maple0', broadleaf({ seed: 131, rx: 14, ry: 12, trunk: 9, girth: 3, ramp: RAMPS.maple, outline: OUTLINE.autumn }), { ...TREE, shadow: [26, 8], leaves: RAMPS.maple[1] });
  define('maple1', broadleaf({ seed: 132, rx: 12, ry: 11, trunk: 8, girth: 3, ramp: RAMPS.red, outline: OUTLINE.autumn }), { ...TREE, shadow: [24, 8], leaves: RAMPS.red[1] });
  define('apple0', broadleaf({ seed: 141, rx: 13, ry: 11, trunk: 7, girth: 3, ramp: RAMPS.apple, fruit: 9 }), { ...TREE, shadow: [24, 8], leaves: RAMPS.apple[1] });
  define('pine0', conifer({ seed: 151, tiers: 4, base: 5, spread: 3, ramp: RAMPS.pine }), { ...TREE, shadow: [22, 7] });
  define('pine1', conifer({ seed: 152, tiers: 3, base: 5, spread: 3, ramp: RAMPS.pine }), { ...TREE, shadow: [18, 6] });
  define('spruce0', conifer({ seed: 153, tiers: 5, base: 4, spread: 2.2, ramp: RAMPS.spruce }), { ...TREE, shadow: [22, 7] });
  define('dead0', deadTree(), { rest: 1, gain: 1, perch: true, shadow: [12, 4] });

  define('boulder0', rock({ seed: 201, w: 24, h: 18, ramp: RAMPS.granite, shape: boulder(24, 18), facets: 7, speckle: 0.1 }), { shadow: [26, 7] });
  define('boulder1', rock({ seed: 202, w: 18, h: 13, ramp: RAMPS.granite, shape: boulder(18, 13), facets: 5, speckle: 0.1 }), { shadow: [20, 6] });
  define('mossy0', rock({ seed: 203, w: 21, h: 15, ramp: RAMPS.basalt, shape: boulder(21, 15), facets: 5, moss: 0.42 }), { shadow: [23, 6] });
  define('cracked0', rock({ seed: 204, w: 20, h: 15, ramp: RAMPS.granite, shape: boulder(20, 15), facets: 4, cracks: 2 }), { shadow: [22, 6] });
  define('slab0', rock({ seed: 205, w: 27, h: 11, ramp: RAMPS.sandstone, outline: OUTLINE.sand, facets: 6, speckle: 0.05,
    shape: (x, y) => inRounded(x, y, 13.5, 6.5, 13.5, 6.5, 4) }), { shadow: [29, 6] });
  define('pile0', rock({ seed: 206, w: 23, h: 13, ramp: RAMPS.sandstone, outline: OUTLINE.sand, facets: 8,
    shape: (x, y) => inEllipse(x, y, 7, 9, 6.5, 4.5) || inEllipse(x, y, 16, 9.5, 6.5, 4) || inEllipse(x, y, 11.5, 5, 5.5, 4.5) }), { shadow: [25, 6] });
  define('stone0', rock({ seed: 207, w: 13, h: 25, ramp: RAMPS.basalt, facets: 6, speckle: 0.06, moss: 0.12,
    shape: (x, y) => inRounded(x, y, 6.5, 15, 6.5, 15, 3) }), { shadow: [15, 5] });

  define('stump', stump(), { shadow: [18, 5] });
  define('bush0', bush(301, RAMPS.leaf, 0), { gain: 0.5, shadow: [20, 5] });
  define('bush1', bush(302, RAMPS.apple, 6), { gain: 0.5, shadow: [20, 5] });
  define('bush2', bush(303, RAMPS.birch, 0), { gain: 0.5, shadow: [20, 5] });
  define('tuft', [tuft(0), tuft(1), tuft(2)], { gain: 1 });
  for (const [name, sprite] of Object.entries(Sprites.flowers)) {
    // Flowers nod: the head tips one pixel downwind.
    define(name, swayFrames(canvas(sprite.width + 2, sprite.height), padded(sprite, 1), [0, 1], 4, 1.4), { gain: 0.6 });
  }
  define('mushroom', [Sprites.mushroom], {});

  // Logs lie still; their sawn ends face either way.
  const logLong = fallenLog(32, 501, true);
  const logShort = fallenLog(22, 502, false);
  define('logLong', [logLong], { shadow: [34, 6] });
  define('logLongL', [flipped(logLong)], { shadow: [34, 6] });
  define('logShort', [logShort], { shadow: [24, 6] });
  define('logShortL', [flipped(logShort)], { shadow: [24, 6] });
  // The hill hides what is behind it, as a tree top does; its waterfall runs on the clock, not the wind.
  define('hill', rockyHill(), { hides: true, shadow: [140, 22], falls: { dx: HILL.fallsX, top: HILL.fallsTop } });
  define('falls', waterfall(), { flows: true });

  // Which frame of a prop shows for a given wind strength.
  function frameIndex(art, lean) {
    if (art.frames.length === 1) return 0;
    return Math.max(0, Math.min(art.frames.length - 1, Math.round(art.rest + lean * art.gain)));
  }

  // Running water changes frame this often, a second.
  const FLOW_FRAMES_PER_SECOND = 6;
  const flowFrame = (clock) => Math.floor(clock * FLOW_FRAMES_PER_SECOND) % 4;

  // The frame of a prop to draw for a given wind strength; running water goes by the clock.
  function frame(art, lean, clock = 0) {
    if (art.flows) return art.frames[flowFrame(clock)];
    return art.frames[frameIndex(art, lean)];
  }

  // The top of a tree's crown in that same frame, for a bird sitting on it.
  function top(art, lean) {
    return art.tops[frameIndex(art, lean)];
  }

  // ---- ground, pond, clouds ----

  // The park floor, drawn once: mottled grass, scenery shadows and the hedge.
  function buildGround(level) {
    const rand = seededRandom(7);
    const size = level.size;
    const border = level.border;
    const inner = size - border;

    // Soft light and dark patches of lawn, worked out on a 2-pixel grid to keep start-up quick.
    const cells = size / 2;
    const patches = new Float32Array(cells * cells);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        patches[x + y * cells] = smoothNoise(x * 2, y * 2, 70, 1) * 0.5 + smoothNoise(x * 2, y * 2, 22, 2) * 0.3
          + smoothNoise(x * 2, y * 2, 8, 4) * 0.2;
      }
    }

    const c = pixelCanvas(size, size, (x, y) => {
      if (x >= border && x < inner && y >= border && y < inner) {
        return tone(GRASS, (patches[(x >> 1) + (y >> 1) * cells] - 0.25) * 2, x, y, false);
      }
      const onEdge = ((x === border - 1 || x === inner) && y >= border - 1 && y <= inner)
        || ((y === border - 1 || y === inner) && x >= border - 1 && x <= inner);
      if (onEdge) return OUTLINE.leaf;
      const speck = hash(x, y, 3);
      if (speck < 0.14) return HEDGE[0];
      if (speck > 0.86) return HEDGE[3];
      return smoothNoise(x, y, 5, 5) > 0.58 ? HEDGE[1] : HEDGE[2];
    });

    const g = c.getContext('2d');
    for (let ty = border; ty < inner; ty += level.tile) {
      for (let tx = border; tx < inner; tx += level.tile) {
        for (let i = 0; i < 3; i++) {
          g.fillStyle = rand() < 0.5 ? '#458a37' : '#74c257';
          g.fillRect(tx + Math.floor(rand() * 16), ty + Math.floor(rand() * 16), 1, 1);
        }
      }
    }
    for (const prop of level.props) {
      const size2 = props[prop.sprite].shadow;
      if (!size2) continue;
      g.drawImage(Sprites.shadow(size2[0], size2[1]), Math.round(prop.x - size2[0] / 2), Math.round(prop.y - size2[1] / 2 - 1));
    }
    // The top hedge casts a little shade into the park.
    g.fillStyle = 'rgba(0, 0, 0, 0.18)';
    g.fillRect(border, border, inner - border, 3);
    return c;
  }

  // A pond's water: the colour at park pixel (px, py) in frame `f`, or null
  // beyond its shore. Glints drift across and the shoreline shimmers.
  function pondWater(pond, rand) {
    const lit = [new Set(), new Set(), new Set(), new Set()];
    for (let i = 0; i < 46; i++) {
      const angle = rand() * TAU;
      const reach = Math.sqrt(rand()) * 0.8;
      const x = Math.round(pond.x + Math.cos(angle) * pond.a * reach);
      const y = Math.round(pond.y + Math.sin(angle) * pond.b * reach);
      const length = 2 + Math.floor(rand() * 3);
      const phase = Math.floor(rand() * 4);
      for (let f = 0; f < 4; f++) {
        const step = (f + phase) % 4;
        if (step === 3) continue;   // each glint winks out for one frame, then starts again
        for (let i2 = 0; i2 < length; i2++) lit[f].add((x + step * 2 + i2) + ',' + y);
      }
    }
    return (px, py, f) => {
      const dx = px + 0.5 - pond.x;
      const dy = py + 0.5 - pond.y;
      const angle = Math.atan2(dy, dx);
      const n = ((dx / pond.a) ** 2 + (dy / pond.b) ** 2) * (1 + 0.05 * Math.sin(angle * 6));
      if (n >= 1.1) return null;
      if (n >= 1) return '#3a7a32';   // damp grass at the water's edge
      if (n >= 0.9) return (Math.floor((angle + Math.PI) * 9) + f) % 4 === 0 ? '#d4eeff' : '#86c2f2';
      if (lit[f].has(px + ',' + py)) return '#b6dcff';
      const checker = (px + py) % 2 === 0;
      if (n < 0.45 || (n < 0.52 && checker)) return '#3a7ec6';
      if (n < 0.75 || (n < 0.8 && checker)) return '#4a90d9';
      return '#62a6e6';
    };
  }

  // The pond as four frames.
  function buildPond(level) {
    const pond = level.pond;
    const water = pondWater(pond, seededRandom(55));
    const pad = 8;
    const left = Math.floor(pond.x - pond.a - pad);
    const top = Math.floor(pond.y - pond.b - pad);
    const w = Math.ceil(pond.a * 2 + pad * 2);
    const h = Math.ceil(pond.b * 2 + pad * 2);
    const frames = [];
    for (let f = 0; f < 4; f++) frames.push(pixelCanvas(w, h, (x, y) => water(x + left, y + top, f)));
    return { x: left, y: top, frames };
  }

  // The stream from the hill's waterfall to the second pond, and that pond,
  // as one picture in four frames, with the log bridge laid across the stream.
  // Glints run downstream; foam where the waterfall lands.
  function buildBrook(level) {
    const { points, half, bridge } = level.stream;
    const pond = level.ponds[1];
    const water = pondWater(pond, seededRandom(56));
    const pad = 10;
    const xs = points.map((point) => point.x).concat(pond.x - pond.a, pond.x + pond.a);
    const ys = points.map((point) => point.y).concat(pond.y - pond.b, pond.y + pond.b);
    const left = Math.floor(Math.min(...xs) - pad);
    const top = Math.floor(Math.min(...ys) - pad);
    const w = Math.ceil(Math.max(...xs) + pad) - left;
    const h = Math.ceil(Math.max(...ys) + pad) - top;
    // Nearest point of the stream's course to each pixel, worked out once.
    const nearest = new Int16Array(w * h).fill(-1);
    const away = new Float32Array(w * h).fill(Infinity);
    points.forEach((point, index) => {
      for (let y = Math.max(0, Math.floor(point.y - half - 3 - top)); y <= Math.min(h - 1, Math.ceil(point.y + half + 3 - top)); y++) {
        for (let x = Math.max(0, Math.floor(point.x - half - 3 - left)); x <= Math.min(w - 1, Math.ceil(point.x + half + 3 - left)); x++) {
          const d = Math.hypot(x + left + 0.5 - point.x, y + top + 0.5 - point.y);
          if (d < away[x + y * w]) { away[x + y * w] = d; nearest[x + y * w] = index; }
        }
      }
    });
    const log = fallenLog(bridge.length, 503, false);
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const frame = pixelCanvas(w, h, (x, y) => {
        const inPond = water(x + left, y + top, f);
        if (inPond && inPond !== '#3a7a32') return inPond;
        const d = away[x + y * w];
        if (d >= half + 1.2) return inPond;
        if (d >= half) return '#3a7a32';
        const s = points[nearest[x + y * w]].s;
        if (s < 7) return (x + y + f) % 3 === 0 ? '#d4eeff' : '#ffffff';   // foam below the waterfall
        // Glints, two pixels long, running downstream three pixels a frame.
        if (d < half - 1 && (s - f * 3 + (x % 3) * 7) % 11 < 2) return '#b6dcff';
        return d < half - 1.5 ? '#3a7ec6' : '#4a90d9';
      });
      // Two logs side by side make the bridge.
      for (const dy of [-12, -3]) frame.getContext('2d').drawImage(log, Math.round(bridge.x - left - bridge.length / 2), Math.round(bridge.y - top + dy));
      frames.push(frame);
    }
    return { x: left, y: top, frames };
  }

  // A cloud's shadow: full strength in the middle, stepping down towards the edge.
  function cloud(seed, w, h) {
    const rand = seededRandom(seed);
    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const rx = w * (0.16 + rand() * 0.1);
      const ry = h * (0.28 + rand() * 0.18);
      puffs.push({ x: rx + (w - rx * 2) * ((i + rand() * 0.6) / 7), y: ry + (h - ry * 2) * rand(), rx, ry });
    }
    return pixelCanvas(w, h, (x, y) => {
      let cover = 0;
      for (const puff of puffs) {
        cover = Math.max(cover, 1 - (((x - puff.x) / puff.rx) ** 2 + ((y - puff.y) / puff.ry) ** 2));
      }
      if (cover <= 0) return null;
      return cover < 0.1 ? CLOUD_SHADE[0] : cover < 0.25 ? CLOUD_SHADE[1] : CLOUD_SHADE[2];
    });
  }

  return {
    props,
    frame,
    flowFrame,
    top,
    buildGround,
    buildPond,
    buildBrook,
    clouds: [cloud(1, 250, 120), cloud(2, 200, 110), cloud(3, 280, 140), cloud(4, 220, 100), cloud(5, 180, 120)],
  };
})();
