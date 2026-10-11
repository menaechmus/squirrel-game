// Park layout. Everything is placed from a fixed seed, so the park is the
// same every time and best times are comparable.

const Level = (() => {
  const TILE = 16;
  const SIZE = TILE * 60;
  const BORDER = TILE * 2;   // hedge thickness
  const SEED = 20261011;
  const ACORN_COUNT = 20;
  const ACORNS_BY_TREES = 6;
  const ACORNS_BY_BUSHES = 4;

  // sprite names, how many, spacing radius, and collision circle (radius, height above base)
  const SCENERY = [
    { sprites: ['tree0', 'tree1', 'tree2', 'pine0', 'pine1'], count: 70, spacing: 20, solid: [5, 3] },
    { sprites: ['rock0', 'rock1'], count: 14, spacing: 15, solid: [8, 5] },
    { sprites: ['stump'], count: 8, spacing: 12, solid: [6, 4] },
    { sprites: ['bush0', 'bush1'], count: 30, spacing: 11 },
    { sprites: ['flowerRed', 'flowerYellow', 'flowerPurple'], count: 70, spacing: 5 },
    { sprites: ['mushroom'], count: 14, spacing: 5 },
  ];

  function generate() {
    const rand = seededRandom(SEED);
    const range = (min, max) => min + rand() * (max - min);
    const spawn = { x: SIZE / 2, y: SIZE / 2 };

    const pond = { x: 0, y: 0, a: range(60, 80), b: range(36, 48) };
    do {
      pond.x = range(200, SIZE - 200);
      pond.y = range(200, SIZE - 200);
    } while (Math.hypot(pond.x - spawn.x, pond.y - spawn.y) < 170);
    const inPond = (x, y, pad) => ((x - pond.x) / (pond.a + pad)) ** 2 + ((y - pond.y) / (pond.b + pad)) ** 2 < 1;

    // Occupied circles, so things don't overlap. The spawn stays clear.
    const taken = [{ x: spawn.x, y: spawn.y, r: 36 }];
    const isFree = (x, y, r) => !inPond(x, y, r + 8)
      && taken.every((other) => Math.hypot(x - other.x, y - other.y) >= r + other.r);
    const inPark = (x, y, r) => x > BORDER + r && x < SIZE - BORDER - r
      && y > BORDER + r + 10 && y < SIZE - BORDER - r;

    function freeSpot(r) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = Math.round(range(BORDER + r + 4, SIZE - BORDER - r - 4));
        const y = Math.round(range(BORDER + r + 14, SIZE - BORDER - r - 4));
        if (isFree(x, y, r)) {
          taken.push({ x, y, r });
          return { x, y };
        }
      }
      return null;
    }

    const props = [];
    for (const group of SCENERY) {
      for (let i = 0; i < group.count; i++) {
        const spot = freeSpot(group.spacing);
        if (!spot) break;
        const prop = { sprite: group.sprites[Math.floor(rand() * group.sprites.length)], x: spot.x, y: spot.y };
        if (group.solid) {
          prop.solid = { x: spot.x, y: spot.y - group.solid[1], r: group.solid[0] };
        }
        props.push(prop);
      }
    }

    // An acorn is unfair if a tree further down the screen draws over it.
    const trees = props.filter((p) => p.sprite.startsWith('tree') || p.sprite.startsWith('pine'));
    const hiddenByTree = (x, y) => trees.some((t) => Math.abs(x - t.x) < 18 && y < t.y && y > t.y - 48);
    const acorns = [];
    function tryAcorn(x, y) {
      if (acorns.length >= ACORN_COUNT || !inPark(x, y, 6) || !isFree(x, y, 5) || hiddenByTree(x, y)) return false;
      taken.push({ x, y, r: 14 });
      acorns.push({ x, y });
      return true;
    }

    // Some acorns are tucked beside trunks or in front of bushes; the rest lie in the open.
    const shuffled = (list) => list.map((item) => [rand(), item]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
    let placed = 0;
    for (const tree of shuffled(trees)) {
      if (placed >= ACORNS_BY_TREES) break;
      if (tryAcorn(tree.x + (rand() < 0.5 ? -12 : 12), tree.y + 3)) placed++;
    }
    placed = 0;
    for (const bush of shuffled(props.filter((p) => p.sprite.startsWith('bush')))) {
      if (placed >= ACORNS_BY_BUSHES) break;
      if (tryAcorn(bush.x + (rand() < 0.5 ? -11 : 11), bush.y + 2)) placed++;
    }
    for (let attempt = 0; attempt < 2000 && acorns.length < ACORN_COUNT; attempt++) {
      tryAcorn(Math.round(range(BORDER + 12, SIZE - BORDER - 12)), Math.round(range(BORDER + 24, SIZE - BORDER - 12)));
    }

    props.sort((a, b) => a.y - b.y);
    return { size: SIZE, tile: TILE, border: BORDER, spawn, pond, props, acorns };
  }

  return { generate };
})();
