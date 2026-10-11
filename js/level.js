// Park layout. Everything is placed from a fixed seed, so the park is the
// same every time.

const Level = (() => {
  const TILE = 16;
  const SIZE = TILE * 60;
  const BORDER = TILE * 2;   // hedge thickness
  const SEED = 20261012;
  const ACORN_COUNT = 30;
  const ACORNS_BY_TREES = 8;
  const ACORNS_BY_BUSHES = 5;
  const TUFT_COUNT = 260;

  // What to scatter: how many, how much room each needs, and which sprites to
  // pick from (repeats make a sprite more common).
  const SCENERY = [
    { count: 10, spacing: 26, sprites: ['oak0', 'oak1'] },
    { count: 58, spacing: 20, sprites: ['elm0', 'elm0', 'elm1', 'elm1', 'birch0', 'birch1', 'maple0', 'maple0', 'maple1', 'maple1',
      'apple0', 'pine0', 'pine0', 'pine1', 'pine1', 'spruce0', 'spruce0', 'dead0'] },
    { count: 18, spacing: 16, sprites: ['boulder0', 'boulder1', 'mossy0', 'cracked0', 'slab0', 'pile0', 'stone0'] },
    { count: 8, spacing: 12, sprites: ['stump'] },
    { count: 30, spacing: 12, sprites: ['bush0', 'bush1', 'bush2'] },
    { count: 70, spacing: 5, sprites: ['flowerRed', 'flowerYellow', 'flowerPurple'] },
    { count: 14, spacing: 5, sprites: ['mushroom'] },
  ];

  // Things you can't walk through: collision circle as [radius, height of its centre above the base].
  const SOLID = {
    oak0: [6, 3], oak1: [6, 3], elm0: [5, 3], elm1: [5, 3], birch0: [4, 3], birch1: [4, 3],
    maple0: [5, 3], maple1: [5, 3], apple0: [5, 3], pine0: [5, 3], pine1: [5, 3], spruce0: [5, 3], dead0: [4, 3],
    boulder0: [9, 6], boulder1: [7, 5], mossy0: [8, 5], cracked0: [8, 5], slab0: [9, 3], pile0: [8, 4], stone0: [5, 3],
    stump: [6, 4],
  };

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
    const solids = [];
    for (const group of SCENERY) {
      for (let i = 0; i < group.count; i++) {
        const spot = freeSpot(group.spacing);
        if (!spot) break;
        const sprite = group.sprites[Math.floor(rand() * group.sprites.length)];
        props.push({ sprite, x: spot.x, y: spot.y });
        if (SOLID[sprite]) solids.push({ x: spot.x, y: spot.y - SOLID[sprite][1], r: SOLID[sprite][0] });
      }
    }

    // An acorn is unfair if a tree further down the screen draws over it.
    const trees = props.filter((prop) => Scenery.props[prop.sprite].hides);
    const hiddenByTree = (x, y) => trees.some((tree) => {
      const sprite = Scenery.props[tree.sprite].frames[0];
      return Math.abs(x - tree.x) < sprite.width / 2 && y < tree.y && y > tree.y - sprite.height - 4;
    });
    const acorns = [];
    // A tucked acorn sits right beside its tree or bush, inside that prop's own
    // elbow room, so it is checked against trunks, rocks and other acorns instead.
    const besideScenery = (x, y) => solids.every((solid) => Math.hypot(x - solid.x, y - solid.y) >= solid.r + 6)
      && acorns.every((acorn) => Math.hypot(x - acorn.x, y - acorn.y) >= 30);
    function tryAcorn(x, y, tucked) {
      if (acorns.length >= ACORN_COUNT || !inPark(x, y, 6) || inPond(x, y, 13) || hiddenByTree(x, y)) return false;
      if (tucked ? !besideScenery(x, y) : !isFree(x, y, 5)) return false;
      taken.push({ x, y, r: 14 });
      acorns.push({ x, y });
      return true;
    }

    // Some acorns are tucked beside trunks or in front of bushes; the rest lie in the open.
    const shuffled = (list) => list.map((item) => [rand(), item]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
    let placed = 0;
    for (const tree of shuffled(trees)) {
      if (placed >= ACORNS_BY_TREES) break;
      if (tryAcorn(tree.x + (rand() < 0.5 ? -12 : 12), tree.y + 3, true)) placed++;
    }
    placed = 0;
    for (const bush of shuffled(props.filter((prop) => prop.sprite.startsWith('bush')))) {
      if (placed >= ACORNS_BY_BUSHES) break;
      if (tryAcorn(bush.x + (rand() < 0.5 ? -13 : 13), bush.y + 2, true)) placed++;
    }
    for (let attempt = 0; attempt < 3000 && acorns.length < ACORN_COUNT; attempt++) {
      tryAcorn(Math.round(range(BORDER + 12, SIZE - BORDER - 12)), Math.round(range(BORDER + 24, SIZE - BORDER - 12)));
    }

    // Grass tufts go anywhere dry; they're only decoration.
    for (let i = 0; i < TUFT_COUNT; i++) {
      const x = Math.round(range(BORDER + 6, SIZE - BORDER - 6));
      const y = Math.round(range(BORDER + 10, SIZE - BORDER - 4));
      if (!inPond(x, y, 6)) props.push({ sprite: 'tuft', x, y });
    }
    props.sort((a, b) => a.y - b.y);

    // Nudge a creature of the given radius out of anything solid and keep it inside the hedge.
    function pushOut(creature, radius) {
      for (let pass = 0; pass < 2; pass++) {
        for (const solid of solids) {
          const dx = creature.x - solid.x;
          const dy = creature.y - solid.y;
          const reach = solid.r + radius;
          if (dx * dx + dy * dy < reach * reach) {
            const distance = Math.hypot(dx, dy) || 0.01;
            creature.x = solid.x + (dx / distance) * reach;
            creature.y = solid.y + (dy / distance) * reach;
          }
        }
        // The pond blocks a little further down the screen than it is drawn,
        // so a creature's body never overlaps the water.
        const a = pond.a + radius;
        const b = pond.b + radius + 5;
        const nx = (creature.x - pond.x) / a;
        const ny = (creature.y - (pond.y + 5)) / b;
        const n = Math.hypot(nx, ny);
        if (n < 1) {
          creature.x = pond.x + (nx / (n || 0.01)) * a;
          creature.y = pond.y + 5 + (ny / (n || 0.01)) * b;
        }
      }
      const edge = BORDER + radius;
      creature.x = Math.min(SIZE - edge, Math.max(edge, creature.x));
      creature.y = Math.min(SIZE - edge, Math.max(edge + 10, creature.y));
    }

    // Is a circle here touching scenery, water or the hedge?
    function blocked(x, y, radius) {
      return !inPark(x, y, radius) || inPond(x, y, radius + 6)
        || solids.some((solid) => Math.hypot(x - solid.x, y - solid.y) < solid.r + radius);
    }

    return { size: SIZE, tile: TILE, border: BORDER, spawn, pond, props, acorns, pushOut, blocked };
  }

  return { generate };
})();
