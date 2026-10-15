// Park layout. Everything is placed from a fixed seed, so the park is the
// same every time.

const Level = (() => {
  const TILE = 16;
  const SIZE = TILE * 60;
  const BORDER = TILE * 2;   // hedge thickness
  const SEED = 20261012;
  const ACORN_COUNT = 68;
  const ACORNS_BY_TREES = 18;
  const ACORNS_BY_BUSHES = 12;
  const TUFT_COUNT = 260;

  // ---- what stays where it is ----
  // The first pond, in the north-west.
  const FIRST_POND = { x: 404.16, y: 205.03, a: 66.82, b: 36.21 };
  // The south-east: a rocky mountain against the east hedge with a waterfall
  // down its face, the stream it feeds, which runs into a second pond and on
  // out through the south hedge, and a log bridge over each stretch.
  const MOUNTAIN_MIDDLE = 640;   // how far down the east edge the middle of the mountain is
  const SMALL_POND = { x: 745, y: 835, a: 36, b: 22 };
  // The stream in two stretches, each smoothed into a curve: from the foot of
  // the waterfall (wherever the mountain's picture puts it) into the pond, and
  // from the pond out through the hedge, past the edge of the park.
  const STREAM_COURSES = [
    [[864, 718], [870, 744], [872, 770], [866, 794], [846, 812], [818, 824], [790, 831], [768, 834]],
    [[738, 848], [732, 872], [737, 896], [744, 918], [739, 940], [735, 968]],
  ];
  // How wide the water is either side of each stretch's line, `s` pixels down
  // it: wandering a little, and wide in the pool under the waterfall.
  const STREAM_HALF = [
    (s) => 3.7 + s * 0.004 + 0.55 * Math.sin(s * 0.11 + 0.7) + 0.3 * Math.sin(s * 0.29) + 9 * Math.cos(Math.min(1, Math.abs(s - 10) / 16) * Math.PI / 2) ** 2,
    (s) => 4.3 + 0.5 * Math.sin(s * 0.13 + 2.1) + 0.3 * Math.sin(s * 0.31 + 0.4),
  ];
  // Each stretch's log bridge: how far down the stretch, how long its logs, how much of the stream it spans.
  const BRIDGES = [{ along: 74, length: 26, gap: 28 }, { along: 37, length: 26, gap: 28 }];

  // ---- the paths ----
  // Two dirt paths, one north to south and one west to east, crossing where
  // the squirrel starts: smooth curves through these points, from beyond one
  // hedge to beyond the other. The first keeps clear of the pond.
  const PATH_COURSES = [
    [[470, -8], [474, 60], [490, 130], [506, 205], [500, 290], [487, 370], [480, 480], [469, 585], [453, 690], [461, 800], [478, 890], [474, 968]],
    [[-8, 486], [70, 498], [160, 466], [260, 502], [370, 474], [480, 480], [590, 458], [700, 490], [800, 450], [880, 468], [968, 462]],
  ];
  const PATH_HALF = 6;   // half a path's width

  // ---- trees ----
  // Most trees stand in copses: clumps whose tops meet, each mostly of one
  // kind. The rest stand alone or in twos and threes between them. (More trees
  // than the 68 of the evenly spread park before 1.11, so the open ground
  // between the copses is not left bare.)
  const TREE_COUNT = 88;
  const COPSES = { count: 6, trees: [8, 11], radius: [32, 42], spacing: 9, fromHedge: 70 };
  const COPSE_KINDS = [
    ['pine0', 'pine0', 'pine1', 'spruce0', 'spruce0'],    // a pine wood
    ['birch0', 'birch1', 'birch0', 'birch1', 'elm1'],      // a birch stand
    ['oak0', 'oak1', 'elm0', 'elm0', 'elm1'],              // oaks and elms
    ['maple0', 'maple1', 'maple0', 'apple0', 'elm0'],      // maples
    ['spruce0', 'pine1', 'pine0', 'birch0'],               // conifers with a birch or two
    ['elm0', 'elm1', 'apple0', 'oak1', 'maple1'],          // mixed
  ];
  // `paired`: the share that stand near another lone tree, in twos and threes.
  const LONE_TREES = { spacing: 20, paired: 0.4, sprites: ['oak0', 'oak1', 'elm0', 'elm1', 'birch0', 'birch1', 'maple0', 'maple1', 'apple0', 'pine0', 'pine1', 'spruce0', 'dead0'] };

  // What else to scatter: how many, how much room each needs, which sprites to
  // pick from (repeats make a sprite more common), and either the share that
  // grow at the edge of a copse (`byCopses`) or that they keep to the open (`open`).
  const SCENERY = [
    { count: 18, spacing: 16, sprites: ['boulder0', 'boulder1', 'mossy0', 'cracked0', 'slab0', 'pile0', 'stone0'] },
    { count: 8, spacing: 12, sprites: ['stump'], byCopses: 0.5 },
    { count: 30, spacing: 12, sprites: ['bush0', 'bush1', 'bush2'], byCopses: 0.5 },
    { count: 70, spacing: 5, sprites: ['flowerRed', 'flowerYellow', 'flowerPurple'], open: true },
    { count: 14, spacing: 5, sprites: ['mushroom'], byCopses: 0.8 },
  ];
  const LOG_COUNT = 10;
  const LOGS = ['logLong', 'logLong', 'logLongL', 'logShort', 'logShortL', 'logShortL'];

  // Finding the way: the park as a grid of cells a creature can or cannot stand in.
  const CELL = 8;
  const CLEARANCE = 5;        // a route keeps a creature's middle this far beyond anything solid

  // Things you can't walk through: collision circle as [radius, height of its centre above the base].
  const SOLID = {
    oak0: [6, 3], oak1: [6, 3], elm0: [5, 3], elm1: [5, 3], birch0: [4, 3], birch1: [4, 3],
    maple0: [5, 3], maple1: [5, 3], apple0: [5, 3], pine0: [5, 3], pine1: [5, 3], spruce0: [5, 3], dead0: [4, 3],
    boulder0: [9, 6], boulder1: [7, 5], mossy0: [8, 5], cracked0: [8, 5], slab0: [9, 3], pile0: [8, 4], stone0: [5, 3],
    stump: [6, 4],
  };

  // A smooth curve through a course: a point every pixel or so, each with its distance `s` along.
  function smoothCourse(course) {
    const points = [];
    for (let i = 0; i < course.length - 1; i++) {
      const [p0, p1, p2, p3] = [course[Math.max(0, i - 1)], course[i], course[i + 1], course[Math.min(course.length - 1, i + 2)]];
      const steps = Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y));
      for (let k = 0; k < steps; k++) {
        const u = k / steps;
        const spline = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
        points.push({ x: spline(p0.x, p1.x, p2.x, p3.x), y: spline(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    points.push({ x: course[course.length - 1].x, y: course[course.length - 1].y });
    points[0].s = 0;
    for (let i = 1; i < points.length; i++) points[i].s = points[i - 1].s + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return points;
  }

  function generate() {
    const rand = seededRandom(SEED);
    const range = (min, max) => min + rand() * (max - min);
    const shuffled = (list) => list.map((item) => [rand(), item]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
    const spawn = { x: SIZE / 2, y: SIZE / 2 };
    const inPark = (x, y, r) => x > BORDER + r && x < SIZE - BORDER - r
      && y > BORDER + r + 10 && y < SIZE - BORDER - r;

    // ---- what stays where it is: the ponds, the mountain and its stream ----
    const pond = { ...FIRST_POND };
    const smallPond = { ...SMALL_POND };
    const ponds = [pond, smallPond];
    const inAnyPond = (x, y, pad) => ponds.some((each) => ((x - each.x) / (each.a + pad)) ** 2 + ((y - each.y) / (each.b + pad)) ** 2 < 1);

    // The mountain: solid over the whole of its picture, a shape whose middle is
    // on the east edge, so that half of it runs on beyond the park.
    const mountainArt = Scenery.props.mountain;
    const picture = mountainArt.frames[0];
    const foot = { x: SIZE, y: MOUNTAIN_MIDDLE, shape: mountainArt.foot.shape };
    const mountain = { x: SIZE - mountainArt.foot.dx, y: MOUNTAIN_MIDDLE - mountainArt.foot.dy, w: picture.width, h: picture.height, foot };
    const onMountain = (x, y, pad) => foot.shape(x - foot.x, y - foot.y, pad) < 1;
    const falls = { x: mountain.x + mountainArt.falls.dx, y: mountain.y + mountainArt.falls.dy };

    // The stream, stretch by stretch: each point with how wide the water is either side of it.
    const streams = STREAM_COURSES.map((list, index) => {
      const points = smoothCourse((index === 0 ? [falls] : []).concat(list.map(([x, y]) => ({ x, y }))));
      for (const point of points) point.half = STREAM_HALF[index](point.s);
      const at = points.find((point) => point.s >= BRIDGES[index].along);
      return { points, bridge: { x: at.x, y: at.y, s: at.s, length: BRIDGES[index].length, gap: BRIDGES[index].gap } };
    });
    const streamPoints = streams.flatMap((stretch) => stretch.points);
    // Most of the park is nowhere near the stream: a box round it saves looking at every point.
    const streamBox = {
      left: Math.min(...streamPoints.map((point) => point.x)) - 16, right: Math.max(...streamPoints.map((point) => point.x)) + 16,
      top: Math.min(...streamPoints.map((point) => point.y)) - 16, bottom: Math.max(...streamPoints.map((point) => point.y)) + 16,
    };
    const nearStream = (x, y, pad) => x > streamBox.left - pad && x < streamBox.right + pad && y > streamBox.top - pad && y < streamBox.bottom + pad
      && streamPoints.some((point) => Math.hypot(x - point.x, y - point.y) < point.half + pad);

    // Water that cannot be walked through: each stretch as a chain of short
    // strips, each `reach` wide either side of its line, broken under its bridge.
    const banks = [];
    for (const { points, bridge } of streams) {
      for (let i = 0; i < points.length - 1; i += 3) {
        const a = points[i];
        const b = points[Math.min(points.length - 1, i + 3)];
        if (Math.abs((a.s + b.s) / 2 - bridge.s) < bridge.gap / 2) continue;
        const reach = Math.max(a.half, b.half) + 0.5;
        banks.push({ a, b, reach, left: Math.min(a.x, b.x) - reach, right: Math.max(a.x, b.x) + reach, top: Math.min(a.y, b.y) - reach, bottom: Math.max(a.y, b.y) + reach });
      }
    }
    // The nearest point to (x, y) on a strip's line.
    const closestOn = (strip, x, y) => {
      const dx = strip.b.x - strip.a.x;
      const dy = strip.b.y - strip.a.y;
      const along = Math.max(0, Math.min(1, ((x - strip.a.x) * dx + (y - strip.a.y) * dy) / (dx * dx + dy * dy || 1)));
      return { x: strip.a.x + dx * along, y: strip.a.y + dy * along };
    };
    // Whether a circle can touch a strip at all: most of the park is nowhere near the stream.
    const nearStrip = (strip, x, y, radius) => x + radius > strip.left && x - radius < strip.right && y + radius > strip.top && y - radius < strip.bottom;
    const inStream = (x, y, radius) => banks.some((strip) => {
      if (!nearStrip(strip, x, y, radius)) return false;
      const near = closestOn(strip, x, y);
      return Math.hypot(x - near.x, y - near.y) < strip.reach + radius;
    });
    // Water and the mountain: nothing grows or stands in or on them.
    const inFeature = (x, y, pad) => inAnyPond(x, y, pad) || onMountain(x, y, pad) || nearStream(x, y, pad);

    // ---- the paths ----
    const paths = PATH_COURSES.map((list) => ({ points: smoothCourse(list.map(([x, y]) => ({ x, y }))), half: PATH_HALF }));
    // How far each 4-pixel cell of the park is from the nearer path's line,
    // worked out once, up to 72 px (as far as anything needs to look).
    const FIELD = 4;
    const REACH = 72;
    const fieldCols = SIZE / FIELD;
    const pathAway = new Float32Array(fieldCols * fieldCols).fill(REACH);
    for (const { points } of paths) {
      for (let i = 0; i < points.length; i += 3) {
        const point = points[i];
        for (let row = Math.max(0, Math.floor((point.y - REACH) / FIELD)); row <= Math.min(fieldCols - 1, Math.floor((point.y + REACH) / FIELD)); row++) {
          for (let col = Math.max(0, Math.floor((point.x - REACH) / FIELD)); col <= Math.min(fieldCols - 1, Math.floor((point.x + REACH) / FIELD)); col++) {
            const away = Math.hypot((col + 0.5) * FIELD - point.x, (row + 0.5) * FIELD - point.y);
            if (away < pathAway[col + row * fieldCols]) pathAway[col + row * fieldCols] = away;
          }
        }
      }
    }
    const fromPath = (x, y) => pathAway[Math.min(fieldCols - 1, Math.max(0, Math.floor(x / FIELD))) + Math.min(fieldCols - 1, Math.max(0, Math.floor(y / FIELD))) * fieldCols];
    const onPath = (x, y, pad) => fromPath(x, y) < PATH_HALF + pad;

    // Occupied circles, so things don't overlap. The spawn stays clear, and so
    // does the ground in front of the waterfall, so nothing hides it.
    const taken = [{ x: spawn.x, y: spawn.y, r: 36 }, { x: falls.x, y: mountain.y + 16, r: 22 }];
    const isFree = (x, y, r) => inPark(x, y, r) && !inFeature(x, y, r + 8) && !onPath(x, y, r + 2)
      && taken.every((other) => Math.hypot(x - other.x, y - other.y) >= r + other.r);
    const anywhere = (r) => ({ x: Math.round(range(BORDER + r + 4, SIZE - BORDER - r - 4)), y: Math.round(range(BORDER + r + 14, SIZE - BORDER - r - 4)) });

    const props = [{ sprite: 'mountain', x: mountain.x, y: mountain.y }];
    const solids = [];
    function place(sprite, x, y, r) {
      taken.push({ x, y, r });
      const prop = { sprite, x, y };
      props.push(prop);
      if (SOLID[sprite]) solids.push({ x, y: y - SOLID[sprite][1], r: SOLID[sprite][0], owner: prop });
      return prop;
    }

    // ---- copses, then lone trees ----
    // Each copse goes where it is furthest from the others (the best of a few
    // tries), so they spread across the park; clear of the hedge, the water,
    // the mountain, the paths and the start.
    const copses = [];
    while (copses.length < COPSES.count) {
      let best = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const radius = range(COPSES.radius[0], COPSES.radius[1]);
        const x = range(BORDER + COPSES.fromHedge, SIZE - BORDER - COPSES.fromHedge);
        const y = range(BORDER + COPSES.fromHedge, SIZE - BORDER - COPSES.fromHedge);
        if (inFeature(x, y, radius + 30) || onPath(x, y, radius + 14) || Math.hypot(x - spawn.x, y - spawn.y) < radius + 90) continue;
        const room = Math.min(Infinity, ...copses.map((other) => Math.hypot(x - other.x, y - other.y)));
        if (!best || room > best.room) best = { x, y, radius, room };
      }
      if (!best) break;
      copses.push({ x: best.x, y: best.y, radius: best.radius, trees: [] });
    }
    // A copse is seen from above at a slant, so a little flatter than round.
    const SLANT = 0.8;
    const inACopse = (x, y, pad) => copses.some((copse) => Math.hypot(x - copse.x, (y - copse.y) / SLANT) < copse.radius + pad);
    shuffled(COPSE_KINDS).slice(0, copses.length).forEach((kind, index) => {
      const copse = copses[index];
      const count = COPSES.trees[0] + Math.floor(rand() * (COPSES.trees[1] - COPSES.trees[0] + 1));
      for (let attempt = 0; attempt < 120 && copse.trees.length < count; attempt++) {
        const angle = rand() * Math.PI * 2;
        const reach = copse.radius * Math.sqrt(rand());
        const x = Math.round(copse.x + Math.cos(angle) * reach);
        const y = Math.round(copse.y + Math.sin(angle) * reach * SLANT);
        if (isFree(x, y, COPSES.spacing)) copse.trees.push(place(kind[Math.floor(rand() * kind.length)], x, y, COPSES.spacing));
      }
    });
    const lone = [];
    for (let attempt = 0; attempt < 4000 && props.length - 1 < TREE_COUNT; attempt++) {
      // Some stand near another lone tree, in twos and threes; the rest anywhere.
      let spot = anywhere(LONE_TREES.spacing);
      if (lone.length && rand() < LONE_TREES.paired) {
        const other = lone[Math.floor(rand() * lone.length)];
        const angle = rand() * Math.PI * 2;
        const reach = 2 * LONE_TREES.spacing + rand() * 12;
        spot = { x: Math.round(other.x + Math.cos(angle) * reach), y: Math.round(other.y + Math.sin(angle) * reach * SLANT) };
      }
      if (!isFree(spot.x, spot.y, LONE_TREES.spacing)) continue;
      lone.push(place(LONE_TREES.sprites[Math.floor(rand() * LONE_TREES.sprites.length)], spot.x, spot.y, LONE_TREES.spacing));
    }

    // ---- rocks, stumps, bushes, flowers and mushrooms ----
    // Just outside a copse's edge, for what grows at the edge of a wood.
    const byACopse = () => {
      const copse = copses[Math.floor(rand() * copses.length)];
      const angle = rand() * Math.PI * 2;
      const reach = copse.radius + 6 + rand() * 22;
      return { x: Math.round(copse.x + Math.cos(angle) * reach), y: Math.round(copse.y + Math.sin(angle) * reach * SLANT) };
    };
    for (const group of SCENERY) {
      for (let i = 0; i < group.count; i++) {
        const edge = copses.length && group.byCopses && rand() < group.byCopses;
        for (let attempt = 0; attempt < 200; attempt++) {
          const spot = edge ? byACopse() : anywhere(group.spacing);
          if ((group.open && inACopse(spot.x, spot.y, 10)) || !isFree(spot.x, spot.y, group.spacing)) continue;
          place(group.sprites[Math.floor(rand() * group.sprites.length)], spot.x, spot.y, group.spacing);
          break;
        }
      }
    }

    // ---- logs, by the copses and beside the paths, each solid along its length ----
    const besideAPath = () => {
      const { points } = paths[Math.floor(rand() * paths.length)];
      const at = points[Math.floor(rand() * points.length)];
      const side = rand() < 0.5 ? -1 : 1;
      return { x: Math.round(at.x + side * (PATH_HALF + 16 + rand() * 14)), y: Math.round(at.y + side * (rand() - 0.5) * 20) };
    };
    const logs = [];
    for (let attempt = 0; attempt < 800 && logs.length < LOG_COUNT; attempt++) {
      const spot = copses.length && rand() < 0.6 ? byACopse() : besideAPath();
      const sprite = LOGS[Math.floor(rand() * LOGS.length)];
      if (!isFree(spot.x, spot.y, 18)) continue;
      taken.push({ x: spot.x, y: spot.y, r: 18 });
      props.push({ sprite, x: spot.x, y: spot.y });
      const half = Scenery.props[sprite].frames[0].width / 2 - 5;
      for (let along = -half; along <= half + 0.01; along += (2 * half) / Math.ceil((2 * half) / 7)) solids.push({ x: spot.x + along, y: spot.y - 5, r: 5 });
      logs.push({ x: spot.x, y: spot.y });
    }

    // An acorn is unfair if a tree further down the screen draws over it.
    const trees = props.filter((prop) => Scenery.props[prop.sprite].hides && Scenery.props[prop.sprite].tops);
    const hiddenByTree = (x, y) => trees.some((tree) => {
      const sprite = Scenery.props[tree.sprite].frames[0];
      return Math.abs(x - tree.x) < sprite.width / 2 && y < tree.y && y > tree.y - sprite.height - 4;
    });

    // Nudge a creature of the given radius out of anything solid and keep it
    // inside the hedge. Water always stops it; with `scenery` false, nothing else does.
    function pushOut(creature, radius, scenery = true) {
      // Out of an ellipse, straight away from its middle.
      const outOfEllipse = (cx, cy, a, b) => {
        const nx = (creature.x - cx) / a;
        const ny = (creature.y - cy) / b;
        const n = Math.hypot(nx, ny);
        if (n < 1) {
          creature.x = cx + (nx / (n || 0.01)) * a;
          creature.y = cy + (ny / (n || 0.01)) * b;
        }
      };
      // Out of the mountain, square to its edge: a few steps the way its shape
      // rises fastest, since its middle is too far off to push away from.
      const outOfMountain = () => {
        const shape = (x, y) => foot.shape(x - foot.x, y - foot.y, radius);
        for (let step = 0; step < 4; step++) {
          const inside = shape(creature.x, creature.y);
          if (inside >= 1) return;
          const gx = (shape(creature.x + 0.5, creature.y) - shape(creature.x - 0.5, creature.y));
          const gy = (shape(creature.x, creature.y + 0.5) - shape(creature.x, creature.y - 0.5));
          const slope = gx * gx + gy * gy;
          if (slope < 1e-12) { creature.x -= radius; continue; }
          const t = (1 - inside) / slope + 0.02 / Math.sqrt(slope);
          creature.x += gx * t;
          creature.y += gy * t;
        }
      };
      for (let pass = 0; pass < 2; pass++) {
        if (scenery) {
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
          outOfMountain();
        }
        // Off the stream's line, square to it.
        for (const strip of banks) {
          if (!nearStrip(strip, creature.x, creature.y, radius)) continue;
          const near = closestOn(strip, creature.x, creature.y);
          const dx = creature.x - near.x;
          const dy = creature.y - near.y;
          const reach = strip.reach + radius;
          if (dx * dx + dy * dy < reach * reach) {
            const distance = Math.hypot(dx, dy) || 0.01;
            creature.x = near.x + (dx / distance) * reach;
            creature.y = near.y + (dy / distance) * reach;
          }
        }
        // A pond blocks a little further down the screen than it is drawn,
        // so a creature's body never overlaps the water.
        for (const each of ponds) outOfEllipse(each.x, each.y + 5, each.a + radius, each.b + radius + 5);
      }
      const edge = BORDER + radius;
      creature.x = Math.min(SIZE - edge, Math.max(edge, creature.x));
      creature.y = Math.min(SIZE - edge, Math.max(edge + 10, creature.y));
    }

    // The nearest water to a spot, for the sound of it: how far to its edge
    // (0 or less in it) and how far to the right of the spot that edge is.
    function nearestWater(x, y) {
      let best = { distance: Infinity, dx: 0 };
      for (const each of ponds) {
        const dx = x - each.x;
        const dy = y - each.y;
        const away = Math.hypot(dx, dy) || 0.01;
        // How far out the shore is, along the line from the middle to the spot.
        const shore = 1 / Math.hypot(dx / away / each.a, dy / away / each.b);
        if (away - shore < best.distance) best = { distance: away - shore, dx: each.x + (dx / away) * shore - x };
      }
      for (let i = 0; i < streamPoints.length; i += 2) {
        const point = streamPoints[i];
        if (point.y > SIZE) continue;   // past the edge of the park, where it runs out under the hedge
        const distance = Math.hypot(x - point.x, y - point.y) - point.half;
        if (distance < best.distance) best = { distance, dx: point.x - x };
      }
      return best;
    }

    // Is a circle here touching scenery, water or the hedge?
    function blocked(x, y, radius) {
      return !inPark(x, y, radius) || inAnyPond(x, y, radius + 6)
        || solids.some((solid) => Math.hypot(x - solid.x, y - solid.y) < solid.r + radius)
        || onMountain(x, y, radius) || inStream(x, y, radius);
    }

    // ---- finding the way ----
    // A cell is open if a creature could stand in its middle with room to spare.
    const COLS = SIZE / CELL;
    const open = new Uint8Array(COLS * COLS);
    for (let row = 0; row < COLS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = (col + 0.5) * CELL;
        const y = (row + 0.5) * CELL;
        const inside = x > BORDER + CLEARANCE && x < SIZE - BORDER - CLEARANCE && y > BORDER + 10 + CLEARANCE && y < SIZE - BORDER - CLEARANCE;
        open[col + row * COLS] = inside && !onMountain(x, y, CLEARANCE) && !inStream(x, y, CLEARANCE)
          && !ponds.some((each) => ((x - each.x) / (each.a + CLEARANCE)) ** 2 + ((y - each.y - 5) / (each.b + CLEARANCE + 5)) ** 2 < 1) ? 1 : 0;
      }
    }
    for (const solid of solids) {
      const reachOut = solid.r + CLEARANCE;
      for (let row = Math.max(0, Math.floor((solid.y - reachOut) / CELL)); row <= Math.min(COLS - 1, Math.floor((solid.y + reachOut) / CELL)); row++) {
        for (let col = Math.max(0, Math.floor((solid.x - reachOut) / CELL)); col <= Math.min(COLS - 1, Math.floor((solid.x + reachOut) / CELL)); col++) {
          if (Math.hypot((col + 0.5) * CELL - solid.x, (row + 0.5) * CELL - solid.y) < reachOut) open[col + row * COLS] = 0;
        }
      }
    }
    const cellOf = (x, y) => Math.min(COLS - 1, Math.max(0, Math.floor(x / CELL))) + Math.min(COLS - 1, Math.max(0, Math.floor(y / CELL))) * COLS;
    const middleOf = (cell) => ({ x: ((cell % COLS) + 0.5) * CELL, y: (Math.floor(cell / COLS) + 0.5) * CELL });
    // The open cell nearest a spot: a creature pressed against a rock may be standing in a closed one.
    function openCellNear(x, y) {
      const home = cellOf(x, y);
      if (open[home]) return home;
      let best = -1;
      let bestDistance = Infinity;
      for (let ring = 1; ring <= 3 && best < 0; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (let dx = -ring; dx <= ring; dx++) {
            const col = (home % COLS) + dx;
            const row = Math.floor(home / COLS) + dy;
            if (col < 0 || row < 0 || col >= COLS || row >= COLS || !open[col + row * COLS]) continue;
            const middle = middleOf(col + row * COLS);
            const distance = Math.hypot(middle.x - x, middle.y - y);
            if (distance < bestDistance) { best = col + row * COLS; bestDistance = distance; }
          }
        }
      }
      return best;
    }

    // Can a creature walk straight from a to b?
    function clearLine(a, b) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
      for (let i = 1; i < steps; i++) {
        if (!open[cellOf(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)]) return false;
      }
      return true;
    }

    // A search over the open cells from `start`, nearest first. With a guess at
    // the distance still to go (`ahead`) it is A*. It stops at the first cell
    // `isGoal` accepts, and returns that cell (or -1) with the distances so far.
    const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    function search(start, isGoal, ahead = () => 0) {
      const dist = new Float32Array(COLS * COLS).fill(Infinity);
      const from = new Int32Array(COLS * COLS).fill(-1);
      const rank = new Float32Array(COLS * COLS);
      const done = new Uint8Array(COLS * COLS);
      // A binary heap of cells, lowest rank first.
      const heap = [];
      const push = (cell) => {
        heap.push(cell);
        for (let i = heap.length - 1; i > 0;) {
          const parent = (i - 1) >> 1;
          if (rank[heap[parent]] <= rank[heap[i]]) break;
          [heap[parent], heap[i]] = [heap[i], heap[parent]];
          i = parent;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          for (let i = 0; ;) {
            const left = 2 * i + 1;
            const right = left + 1;
            let least = i;
            if (left < heap.length && rank[heap[left]] < rank[heap[least]]) least = left;
            if (right < heap.length && rank[heap[right]] < rank[heap[least]]) least = right;
            if (least === i) break;
            [heap[least], heap[i]] = [heap[i], heap[least]];
            i = least;
          }
        }
        return top;
      };
      if (start < 0) return { cell: -1, dist, from };
      dist[start] = 0;
      rank[start] = ahead(start);
      push(start);
      while (heap.length) {
        const cell = pop();
        if (done[cell]) continue;
        done[cell] = 1;
        if (isGoal(cell)) return { cell, dist, from };
        const col = cell % COLS;
        const row = Math.floor(cell / COLS);
        for (const [dx, dy, cost] of STEPS) {
          const c = col + dx;
          const r = row + dy;
          if (c < 0 || r < 0 || c >= COLS || r >= COLS) continue;
          const next = c + r * COLS;
          // No cutting a corner past something solid.
          if (!open[next] || (dx && dy && (!open[c + row * COLS] || !open[col + r * COLS]))) continue;
          if (dist[cell] + cost < dist[next]) {
            dist[next] = dist[cell] + cost;
            rank[next] = dist[next] + ahead(next);
            from[next] = cell;
            push(next);
          }
        }
      }
      return { cell: -1, dist, from };
    }

    // The way along the cells to `end`, then on to the spot itself, with a
    // point kept only where the straight line from the last kept one would hit something.
    function smoothed(from, end, spot) {
      const cells = [];
      for (let cell = end; cell !== -1; cell = from[cell]) cells.push(middleOf(cell));
      cells.reverse();
      cells.push({ x: spot.x, y: spot.y });
      const way = [];
      let anchor = cells[0];
      for (let i = 1; i < cells.length; i++) {
        if (i === cells.length - 1 || !clearLine(anchor, cells[i + 1])) {
          way.push(cells[i]);
          anchor = cells[i];
        }
      }
      return way;
    }

    // The way from one spot to another: waypoints, as few as will do, the last
    // being the spot itself; null if there is no way there.
    function wayTo(from, spot) {
      const end = openCellNear(spot.x, spot.y);
      if (end < 0) return null;
      const endCol = end % COLS;
      const endRow = Math.floor(end / COLS);
      const ahead = (cell) => {
        const dx = Math.abs((cell % COLS) - endCol);
        const dy = Math.abs(Math.floor(cell / COLS) - endRow);
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      };
      const found = search(openCellNear(from.x, from.y), (cell) => cell === end, ahead);
      return found.cell < 0 ? null : smoothed(found.from, end, spot);
    }

    // Of several spots, the one nearest by the way a creature would have to go,
    // and that way: { index, way }, or null if none can be reached.
    function nearestByWay(from, spots) {
      const goals = new Map();
      spots.forEach((spot, index) => {
        const cell = openCellNear(spot.x, spot.y);
        if (cell >= 0 && !goals.has(cell)) goals.set(cell, index);
      });
      if (!goals.size) return null;
      const found = search(openCellNear(from.x, from.y), (cell) => goals.has(cell));
      if (found.cell < 0) return null;
      const index = goals.get(found.cell);
      return { index, way: smoothed(found.from, found.cell, spots[index]) };
    }

    // How far every cell is from a spot, going the way a creature would have to (for tests).
    function distancesFrom(spot) {
      const { dist } = search(openCellNear(spot.x, spot.y), () => false);
      return { dist };
    }

    // How far away a spot is along those ways, in pixels (Infinity if it cannot be reached).
    function distanceTo(field, spot) {
      const cell = openCellNear(spot.x, spot.y);
      return cell < 0 ? Infinity : field.dist[cell] * CELL;
    }

    // ---- acorns ----
    const reachable = distancesFrom(spawn);
    const canReach = (x, y) => {
      for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const cell = cellOf(x + dx, y - 3 + dy);
        if (open[cell] && reachable.dist[cell] < Infinity) return true;
      }
      return false;
    };
    // The rules every acorn keeps, here and when Explore grows a new one: in
    // the park, clear of water, the mountain and anything solid, not under a
    // tree top, and somewhere the squirrel can get to.
    const acornFits = (x, y) => inPark(x, y, 6) && !inFeature(x, y, 13) && !hiddenByTree(x, y) && !blocked(x, y, 6) && canReach(x, y);
    const acorns = [];
    // A tucked acorn sits right beside its tree or bush, inside that prop's own
    // elbow room, so it is checked against trunks, rocks and other acorns instead.
    const besideScenery = (x, y) => solids.every((solid) => Math.hypot(x - solid.x, y - solid.y) >= solid.r + 6)
      && acorns.every((acorn) => Math.hypot(x - acorn.x, y - acorn.y) >= 30);
    function tryAcorn(x, y, tucked) {
      if (acorns.length >= ACORN_COUNT || !acornFits(x, y)) return false;
      if (tucked ? !besideScenery(x, y) : !taken.every((other) => Math.hypot(x - other.x, y - other.y) >= 5 + other.r)) return false;
      taken.push({ x, y, r: 15 });   // so acorns in the open are at least 20 px apart
      acorns.push({ x, y });
      return true;
    }
    // Some acorns are tucked beside trunks or in front of bushes; the rest lie in the open.
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

    // A spot for a new acorn, as Explore grows one for each taken: one that
    // keeps the acorn rules, at least 20 px from the acorns lying about, and
    // `margin` px outside `view` (the part of the park on screen), so it never
    // appears in front of the player. Null if none turned up.
    function newAcornSpot(random, lying, view, margin = 24) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const x = Math.round(BORDER + 12 + random() * (SIZE - 2 * BORDER - 24));
        const y = Math.round(BORDER + 24 + random() * (SIZE - 2 * BORDER - 36));
        if (x > view.x - margin && x < view.x + view.w + margin && y > view.y - margin && y < view.y + view.h + margin) continue;
        if (lying.some((acorn) => Math.hypot(acorn.x - x, acorn.y - y) < 20)) continue;
        if (acornFits(x, y)) return { x, y };
      }
      return null;
    }

    // Grass tufts go anywhere dry, creeping in at the edges of the paths; they're only decoration.
    for (let i = 0; i < TUFT_COUNT; i++) {
      const x = Math.round(range(BORDER + 6, SIZE - BORDER - 6));
      const y = Math.round(range(BORDER + 10, SIZE - BORDER - 4));
      if (!inFeature(x, y, 5) && !onPath(x, y, -2)) props.push({ sprite: 'tuft', x, y });
    }
    props.sort((a, b) => a.y - b.y);

    return {
      size: SIZE, tile: TILE, border: BORDER, spawn, pond, ponds, streams, mountain, falls, paths, logs, props, acorns,
      pushOut, blocked, nearestWater, acornFits, newAcornSpot, wayTo, nearestByWay, clearLine, distancesFrom, distanceTo,
      // For tests: the copses, and the route grid.
      copses: copses.map((copse) => ({ x: copse.x, y: copse.y, radius: copse.radius, trees: copse.trees.length })),
      grid: { cell: CELL, cols: COLS, open, isOpen: (x, y) => open[cellOf(x, y)] === 1 },
    };
  }

  return { generate };
})();
