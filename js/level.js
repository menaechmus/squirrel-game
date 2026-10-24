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
  const TAU = Math.PI * 2;

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

  // ---- the ponds grow (1.16) ----
  // The park is still laid out round the ponds as they were (above); then,
  // last of all, they grow, so nothing else moves. The first stays where it
  // was and runs north out through the top hedge, its top beyond the park
  // and its east shore clear of the path; the second spreads north and west,
  // its south shore and the lower bridge where they were.
  const GROWN_PONDS = [{ x: 388, y: 104, a: 70, b: 143 }, { x: 740, y: 826, a: 52, b: 30 }];

  // ---- the south-west and the landmarks (1.17) ----
  // Added after the ponds grow, so again nothing else moves; fitted to the
  // park by drawing them on its map first. A small windmill and an old well
  // by the south hedge, west of the north-south path; a signpost at the
  // crossing, clear of where the squirrels start; three benches beside the
  // paths (across the path from the big pond, east of the crossing, and by
  // the mill); and a bird bath on the lawn east of the crossing. `ground` is
  // what each stands on, as circles [dx, dy, r] from its foot; `solid`,
  // whether creatures go round it (benches they run under).
  const LANDMARKS = [
    { sprite: 'mill', x: 352, y: 888, ground: [[-5, -6, 8], [5, -6, 8]], solid: true },
    { sprite: 'well', x: 312, y: 900, ground: [[0, -4, 9]], solid: true },
    { sprite: 'signpost', x: 503, y: 452, ground: [[0, -1, 2]], solid: true },
    { sprite: 'birdBath', x: 588, y: 545, ground: [[0, -2, 4]], solid: true },
    { sprite: 'bench', x: 512, y: 140, ground: [[-6, -4, 5], [6, -4, 5]], solid: false },
    { sprite: 'bench', x: 560, y: 452, ground: [[-6, -4, 5], [6, -4, 5]], solid: false },
    { sprite: 'bench', x: 446, y: 862, ground: [[-6, -4, 5], [6, -4, 5]], solid: false },
  ];
  // Reeds and cattails in clumps along parts of each pond's shore and of the
  // stream's banks (repeats make a kind more common); lily pads in a few
  // clusters on each pond; leaf piles under broadleaf trees, spread across the park.
  const REEDS = { ponds: [11, 6], stream: 7, apart: 16, kinds: ['reeds0', 'reeds0', 'reeds0', 'reeds1', 'reeds1', 'cattails', 'cattails'] };
  const PADS = { clusters: [3, 2], each: [3, 5] };
  const PILES = { count: 12, apart: 70, fromAcorns: 16, fromStart: 60 };

  // ---- the hedged field and its meadow (1.18) ----
  // Added after the landmarks, so again nothing else moves. A thick hawthorn
  // hedge fences off the far south-west corner: a smooth course from beyond
  // the west hedge, along and round, to beyond the south hedge, so both its
  // ends are sealed into the park's own; fitted between the trees there by
  // drawing it on the park's map first. Two ways in, as distances along it: a
  // gate in its north side and a gap in its east side, towards the mill.
  // Inside, a meadow of long grass, where everyone wades at `MEADOW_PACE` and
  // the route search counts each cell as that much further.
  const HEDGEROW = {
    course: [[16, 706], [60, 700], [120, 707], [170, 700], [190, 716], [195, 780], [193, 850], [190, 900], [190, 944]],
    half: 5, gaps: [[92, 124], [262, 294]], clumpEvery: 5, clumps: ['hedge0', 'hedge1', 'hedge2'],
  };
  const FIELD_ACORNS = 5;     // laid again in the meadow: the acorns lying in the open nearest the field
  const MEADOW_PACE = 0.75;

  // ---- the paths ----
  // Two dirt paths, one north to south and one west to east, crossing where
  // the squirrel starts: smooth curves through these points, from beyond one
  // hedge to beyond the other. The first keeps clear of the pond.
  const PATH_COURSES = [
    [[470, -8], [474, 60], [490, 130], [506, 205], [500, 290], [487, 370], [480, 480], [469, 585], [453, 690], [461, 800], [478, 890], [474, 968]],
    [[-8, 486], [70, 498], [160, 466], [260, 502], [370, 474], [480, 480], [590, 458], [700, 490], [800, 450], [880, 468], [968, 462]],
  ];
  const PATH_HALF = 6;   // half a path's width

  // ---- the log cabin (1.12) ----
  // Northwest of the crossing: the middle of the foot of its front wall, and a
  // little path (from there, in pixels) that bends from its doorstep down to
  // the west-east path, near where the squirrel starts.
  const CABIN = { x: 392, y: 428 };
  const LANE = [[0, 1], [2, 16], [11, 32], [26, 51]];
  const LANE_HALF = 4;

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
    // Once the cabin stands (see below), its ground counts too.
    let cabin = null;
    const inHouse = (x, y, pad) => cabin !== null && x > cabin.x - cabin.ends - pad && x < cabin.x + cabin.ends + pad
      && y > cabin.y - cabin.depth - pad && y < cabin.y + pad;
    // The field's hedge (1.18), a chain of strips like the stream's banks, and
    // its field and meadow: nothing until that step, so all laid out before
    // it stays where it was.
    const hedgeStrips = [];
    let inField = () => false;
    let inMeadow = () => false;
    const inHedgerow = (x, y, radius) => hedgeStrips.some((strip) => {
      if (!nearStrip(strip, x, y, radius)) return false;
      const near = closestOn(strip, x, y);
      return Math.hypot(x - near.x, y - near.y) < strip.reach + radius;
    });
    const inFeature = (x, y, pad) => inAnyPond(x, y, pad) || onMountain(x, y, pad) || nearStream(x, y, pad) || inHouse(x, y, pad) || inHedgerow(x, y, pad);

    // ---- the paths ----
    const paths = PATH_COURSES.map((list) => ({ points: smoothCourse(list.map(([x, y]) => ({ x, y }))), half: PATH_HALF }));
    // How far each 4-pixel cell of the park is from the nearer path's line,
    // worked out once, up to 72 px (as far as anything needs to look).
    const FIELD = 4;
    const REACH = 72;
    const fieldCols = SIZE / FIELD;
    const pathAway = new Float32Array(fieldCols * fieldCols).fill(REACH);
    // A narrower path is entered as if its line were further off, so that
    // `onPath` measures from its edge the same as for the others.
    function markPath({ points, half }) {
      for (let i = 0; i < points.length; i += 3) {
        const point = points[i];
        for (let row = Math.max(0, Math.floor((point.y - REACH) / FIELD)); row <= Math.min(fieldCols - 1, Math.floor((point.y + REACH) / FIELD)); row++) {
          for (let col = Math.max(0, Math.floor((point.x - REACH) / FIELD)); col <= Math.min(fieldCols - 1, Math.floor((point.x + REACH) / FIELD)); col++) {
            const away = Math.hypot((col + 0.5) * FIELD - point.x, (row + 0.5) * FIELD - point.y) + PATH_HALF - half;
            if (away < pathAway[col + row * fieldCols]) pathAway[col + row * fieldCols] = away;
          }
        }
      }
    }
    paths.forEach(markPath);
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
    // The cabin's walls, as thin boxes on the ground (filled in once it stands).
    const boxes = [];
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
      const prop = { sprite, x: spot.x, y: spot.y };
      props.push(prop);
      const half = Scenery.props[sprite].frames[0].width / 2 - 5;
      for (let along = -half; along <= half + 0.01; along += (2 * half) / Math.ceil((2 * half) / 7)) solids.push({ x: spot.x + along, y: spot.y - 5, r: 5, owner: prop });
      logs.push({ x: spot.x, y: spot.y });
    }

    // ---- the log cabin (1.12) ----
    // Built after everything else that stands in the park, so nothing placed
    // before it moves: whatever stood on its ground or on its little path is
    // cleared away.
    const house = Scenery.props.cabin.house;
    const lane = { points: smoothCourse(LANE.map(([dx, dy]) => ({ x: CABIN.x + dx, y: CABIN.y + dy }))), half: LANE_HALF };
    const onLane = (x, y, pad) => lane.points.some((point) => Math.hypot(x - point.x, y - point.y) < LANE_HALF + pad);
    cabin = { x: CABIN.x, y: CABIN.y, half: house.half, depth: house.depth, ends: house.ends };
    const cleared = props.filter((prop) => prop.sprite !== 'mountain' && (inHouse(prop.x, prop.y, 8) || onLane(prop.x, prop.y, 6)));
    for (const prop of cleared) {
      props.splice(props.indexOf(prop), 1);
      for (let i = solids.length - 1; i >= 0; i--) if (solids[i].owner === prop) solids.splice(i, 1);
      const log = logs.findIndex((each) => each.x === prop.x && each.y === prop.y);
      if (log >= 0) logs.splice(log, 1);
    }
    props.push({ sprite: 'cabin', x: CABIN.x, y: CABIN.y });
    paths.push(lane);
    markPath(lane);
    // Its walls: the back, the two sides out to the log ends, and the front
    // either side of the doorway.
    const wallLeft = CABIN.x - house.ends;
    const wallRight = CABIN.x + house.ends;
    const wallBack = CABIN.y - house.depth;
    boxes.push(
      { left: wallLeft, right: wallRight, top: wallBack, bottom: wallBack + house.thick },
      { left: wallLeft, right: CABIN.x - house.half + house.thick, top: wallBack, bottom: CABIN.y },
      { left: CABIN.x + house.half - house.thick, right: wallRight, top: wallBack, bottom: CABIN.y },
      { left: wallLeft, right: CABIN.x - house.door, top: CABIN.y - house.thick, bottom: CABIN.y },
      { left: CABIN.x + house.door, right: wallRight, top: CABIN.y - house.thick, bottom: CABIN.y },
    );
    // Where things are, for the game: the doorway, inside the walls, the top of
    // the chimney, the fire, the table and the golden acorn under it.
    const cabinSpot = ({ dx, dy }) => ({ x: CABIN.x + dx, y: CABIN.y + dy });
    Object.assign(cabin, {
      door: { x: CABIN.x, y: CABIN.y, half: house.door },
      inside: { left: CABIN.x - house.half + house.thick, right: CABIN.x + house.half - house.thick, top: wallBack + house.thick, bottom: CABIN.y - house.thick },
      chimney: cabinSpot(house.chimney), hearth: cabinSpot(house.hearth), table: cabinSpot(house.table), golden: cabinSpot(house.golden),
      cleared: cleared.map((prop) => [prop.sprite, prop.x, prop.y]),
    });
    // An acorn just behind the cabin would be hidden by its roof.
    const cabinPicture = Scenery.props.cabin.frames[0];
    const behindCabin = (x, y) => Math.abs(x - cabin.x) < cabinPicture.width / 2 + 2 && y < cabin.y && y > cabin.y - cabinPicture.height - 4;
    // Once they stand (1.17), one just behind a landmark would be hidden by it,
    // and one beside a leaf pile lost among its leaves.
    const landmarks = [];
    const pileSpots = [];
    const behindLandmark = (x, y) => landmarks.some((one) => Math.abs(x - one.x) < one.half + 2 && y < one.y && y > one.y - one.height - 4);
    const nearPile = (x, y) => pileSpots.some((pile) => Math.hypot(x - pile.x, y - pile.y) < PILES.fromAcorns);

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
      // Off a wall of the cabin, from its nearest point, so that a creature
      // slides round a corner (into the doorway, say) instead of catching on it.
      const offBox = (box) => {
        const nearX = Math.max(box.left, Math.min(box.right, creature.x));
        const nearY = Math.max(box.top, Math.min(box.bottom, creature.y));
        const dx = creature.x - nearX;
        const dy = creature.y - nearY;
        if (dx * dx + dy * dy >= radius * radius) return;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.01) {
          creature.x = nearX + (dx / distance) * radius;
          creature.y = nearY + (dy / distance) * radius;
          return;
        }
        // Its middle is inside the wall: out by the nearest side.
        const ways = [[creature.x - box.left, -1, 0], [box.right - creature.x, 1, 0], [creature.y - box.top, 0, -1], [box.bottom - creature.y, 0, 1]];
        const [depth, sideways, down] = ways.reduce((best, way) => (way[0] < best[0] ? way : best));
        creature.x += sideways * (depth + radius);
        creature.y += down * (depth + radius);
      };
      // Off a strip of the stream or of the field's hedge, square to its line.
      const offStrip = (strip) => {
        if (!nearStrip(strip, creature.x, creature.y, radius)) return;
        const near = closestOn(strip, creature.x, creature.y);
        const dx = creature.x - near.x;
        const dy = creature.y - near.y;
        const reach = strip.reach + radius;
        if (dx * dx + dy * dy < reach * reach) {
          const distance = Math.hypot(dx, dy) || 0.01;
          creature.x = near.x + (dx / distance) * reach;
          creature.y = near.y + (dy / distance) * reach;
        }
      };
      for (let pass = 0; pass < 2; pass++) {
        if (scenery) {
          for (const box of boxes) offBox(box);
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
          for (const strip of hedgeStrips) offStrip(strip);   // the field's hedge (1.18)
        }
        // Off the stream's line, square to it.
        for (const strip of banks) offStrip(strip);
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

    // Is a circle here touching scenery, water or the hedge? The whole cabin
    // counts, inside too: only the player's squirrel goes in.
    function blocked(x, y, radius) {
      return !inPark(x, y, radius) || inAnyPond(x, y, radius + 6)
        || solids.some((solid) => Math.hypot(x - solid.x, y - solid.y) < solid.r + radius)
        || onMountain(x, y, radius) || inStream(x, y, radius) || inHouse(x, y, radius) || inHedgerow(x, y, radius);
    }
    // The same, water aside: somewhere a frog could sit on the bank (1.17).
    const standsClear = (x, y, radius) => inPark(x, y, radius) && !onMountain(x, y, radius) && !inHouse(x, y, radius) && !inHedgerow(x, y, radius)
      && !solids.some((solid) => Math.hypot(x - solid.x, y - solid.y) < solid.r + radius);

    // ---- finding the way ----
    // A cell is open if a creature could stand in its middle with room to spare.
    const COLS = SIZE / CELL;
    const open = new Uint8Array(COLS * COLS);
    // How much further a step into each cell counts: 1, or more in the long grass of the meadow (1.18).
    const slowness = new Float32Array(COLS * COLS).fill(1);
    // Work out the cells from column `left` to `right` and row `top` to `bottom`.
    function fillCells(left, right, top, bottom) {
      [left, top] = [Math.max(0, left), Math.max(0, top)];
      [right, bottom] = [Math.min(COLS - 1, right), Math.min(COLS - 1, bottom)];
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          const x = (col + 0.5) * CELL;
          const y = (row + 0.5) * CELL;
          const inside = x > BORDER + CLEARANCE && x < SIZE - BORDER - CLEARANCE && y > BORDER + 10 + CLEARANCE && y < SIZE - BORDER - CLEARANCE;
          open[col + row * COLS] = inside && !onMountain(x, y, CLEARANCE) && !inStream(x, y, CLEARANCE) && !inHouse(x, y, CLEARANCE) && !inHedgerow(x, y, CLEARANCE)
            && !ponds.some((each) => ((x - each.x) / (each.a + CLEARANCE)) ** 2 + ((y - each.y - 5) / (each.b + CLEARANCE + 5)) ** 2 < 1) ? 1 : 0;
        }
      }
      for (const solid of solids) {
        const reachOut = solid.r + CLEARANCE;
        for (let row = Math.max(top, Math.floor((solid.y - reachOut) / CELL)); row <= Math.min(bottom, Math.floor((solid.y + reachOut) / CELL)); row++) {
          for (let col = Math.max(left, Math.floor((solid.x - reachOut) / CELL)); col <= Math.min(right, Math.floor((solid.x + reachOut) / CELL)); col++) {
            if (Math.hypot((col + 0.5) * CELL - solid.x, (row + 0.5) * CELL - solid.y) < reachOut) open[col + row * COLS] = 0;
          }
        }
      }
    }
    fillCells(0, COLS - 1, 0, COLS - 1);
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
          const step = cost * slowness[next];
          if (dist[cell] + step < dist[next]) {
            dist[next] = dist[cell] + step;
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

    // Which cells can be got to from a spot, by the steps `search` takes (no
    // cutting corners), as flags: much quicker than working out how far (1.16).
    function reachableFrom(spot) {
      const seen = new Uint8Array(COLS * COLS);
      const start = openCellNear(spot.x, spot.y);
      if (start < 0) return seen;
      const queue = [start];
      seen[start] = 1;
      while (queue.length) {
        const cell = queue.pop();
        const col = cell % COLS;
        const row = Math.floor(cell / COLS);
        for (const [dx, dy] of STEPS) {
          const c = col + dx;
          const r = row + dy;
          if (c < 0 || r < 0 || c >= COLS || r >= COLS) continue;
          const next = c + r * COLS;
          if (seen[next] || !open[next] || (dx && dy && (!open[c + row * COLS] || !open[col + r * COLS]))) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      return seen;
    }

    // ---- acorns ----
    let reachable = reachableFrom(spawn);   // worked out again once the ponds have grown
    const canReach = (x, y) => {
      for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const cell = cellOf(x + dx, y - 3 + dy);
        if (open[cell] && reachable[cell]) return true;
      }
      return false;
    };
    // The rules every acorn keeps, here and when Explore grows a new one: in
    // the park, clear of water, the mountain and anything solid, not under a
    // tree top, the cabin's roof or a landmark, not by a leaf pile, and
    // somewhere the squirrel can get to.
    const acornFits = (x, y) => inPark(x, y, 6) && !inFeature(x, y, 13) && !hiddenByTree(x, y) && !behindCabin(x, y)
      && !behindLandmark(x, y) && !nearPile(x, y) && !blocked(x, y, 6) && canReach(x, y);
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
    const tuckedBy = new Map();   // which were tucked, and by what, to lay one again the same way (1.16)
    let placed = 0;
    for (const tree of shuffled(trees)) {
      if (placed >= ACORNS_BY_TREES) break;
      if (tryAcorn(tree.x + (rand() < 0.5 ? -12 : 12), tree.y + 3, true)) { placed++; tuckedBy.set(acorns[acorns.length - 1], { kind: 'tree', by: tree }); }
    }
    placed = 0;
    for (const bush of shuffled(props.filter((prop) => prop.sprite.startsWith('bush')))) {
      if (placed >= ACORNS_BY_BUSHES) break;
      if (tryAcorn(bush.x + (rand() < 0.5 ? -13 : 13), bush.y + 2, true)) { placed++; tuckedBy.set(acorns[acorns.length - 1], { kind: 'bush', by: bush }); }
    }
    for (let attempt = 0; attempt < 3000 && acorns.length < ACORN_COUNT; attempt++) {
      tryAcorn(Math.round(range(BORDER + 12, SIZE - BORDER - 12)), Math.round(range(BORDER + 24, SIZE - BORDER - 12)));
    }

    // A spot for a new acorn, as Explore grows one for each taken: one that
    // keeps the acorn rules, at least 20 px from the acorns lying about, and
    // `margin` px outside `view` (the part of the park on screen; or a list of
    // views, one for each player), so it never appears in front of a player.
    // Null if none turned up.
    function newAcornSpot(random, lying, view, margin = 24) {
      const views = Array.isArray(view) ? view : [view];
      for (let attempt = 0; attempt < 300; attempt++) {
        const x = Math.round(BORDER + 12 + random() * (SIZE - 2 * BORDER - 24));
        const y = Math.round(BORDER + 24 + random() * (SIZE - 2 * BORDER - 36));
        if (views.some((each) => x > each.x - margin && x < each.x + each.w + margin && y > each.y - margin && y < each.y + each.h + margin)) continue;
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

    // ---- later steps (1.16 on) ----
    // Each adds something once the park is laid out, so nothing laid out
    // before it moves. Whatever its ground covers or crowds is cleared, the
    // route grid round it is worked out again, and the acorns that no longer
    // keep the rules, or whose trunk or bush was cleared, are laid again
    // elsewhere, so there are as many as ever. `took` lists, for the layout
    // check, what each step took away.
    const cellAt = (v) => Math.floor(v / CELL);
    function clearAway(crowded, gone, took) {
      for (let i = props.length - 1; i >= 0; i--) {
        const prop = props[i];
        if (prop.sprite === 'mountain' || prop.sprite === 'cabin' || !crowded(prop)) continue;
        props.splice(i, 1);
        gone.add(prop);
        for (let k = solids.length - 1; k >= 0; k--) if (solids[k].owner === prop) solids.splice(k, 1);
        const log = logs.findIndex((each) => each.x === prop.x && each.y === prop.y);
        if (log >= 0) logs.splice(log, 1);
        if (trees.includes(prop)) trees.splice(trees.indexOf(prop), 1);
        if (prop.sprite !== 'tuft') took.push([prop.sprite, prop.x, prop.y]);
      }
    }
    // Lay again each acorn that has to go, the way it was: beside another
    // trunk or bush, or in the open, drawing on `random`. Each new one takes
    // the taken one's place in the list, so every other acorn keeps its
    // number (tests address acorns by number).
    function layAgain(random, gone, took) {
      const lost = { tree: 0, bush: 0 };
      const vacated = [];   // the places in the list of those taken, lowest first
      for (let i = acorns.length - 1; i >= 0; i--) {
        const acorn = acorns[i];
        const tucked = tuckedBy.get(acorn);
        if (acornFits(acorn.x, acorn.y) && !(tucked && gone.has(tucked.by))) continue;
        took.push([acorn.x, acorn.y]);
        if (tucked) lost[tucked.kind]++;
        acorns.splice(i, 1);
        vacated.unshift(i);
      }
      const kept = acorns.length;
      const mixed = (list) => list.map((item) => [random(), item]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
      const tuckAgain = (beside, kind, dx, dy, count) => {
        for (const prop of mixed(beside)) {
          if (count <= 0) break;
          if (tryAcorn(prop.x + (random() < 0.5 ? -dx : dx), prop.y + dy, true)) {
            count--;
            tuckedBy.set(acorns[acorns.length - 1], { kind, by: prop });
          }
        }
      };
      tuckAgain(trees, 'tree', 12, 3, lost.tree);
      tuckAgain(props.filter((prop) => prop.sprite.startsWith('bush')), 'bush', 13, 2, lost.bush);
      for (let attempt = 0; attempt < 3000 && acorns.length < ACORN_COUNT; attempt++) {
        tryAcorn(Math.round(BORDER + 12 + random() * (SIZE - 2 * BORDER - 24)), Math.round(BORDER + 24 + random() * (SIZE - 2 * BORDER - 36)));
      }
      acorns.splice(kept).forEach((acorn, k) => acorns.splice(vacated[k], 0, acorn));
    }

    // ---- the ponds grow (1.16) ----
    // Last of the original park, so nothing laid out above moves. Whatever the
    // bigger water covers or crowds is cleared: anything solid within 8 px of
    // it, a bush, flower or mushroom within 8 px, a tuft within 5 (as tufts
    // are placed). The acorns are laid again with the park's own random numbers.
    const flooded = { props: [], acorns: [] };
    const before = ponds.map(({ x, y, a, b }) => ({ x, y, a, b }));
    ponds.forEach((each, i) => Object.assign(each, GROWN_PONDS[i], { before: before[i] }));
    const washedAway = new Set();
    clearAway((prop) => {
      const own = solids.filter((solid) => solid.owner === prop);
      if (own.length) return own.some((solid) => inAnyPond(solid.x, solid.y, solid.r + 8));
      return inAnyPond(prop.x, prop.y, prop.sprite === 'tuft' ? 5 : 8);
    }, washedAway, flooded.props);
    // The cells round each pond as it was and as it is, far enough out to take
    // in what was cleared from its shore.
    ponds.forEach((each, i) => {
      const was = before[i];
      const out = 48;
      fillCells(cellAt(Math.min(was.x - was.a, each.x - each.a) - out), cellAt(Math.max(was.x + was.a, each.x + each.a) + out),
        cellAt(Math.min(was.y - was.b, each.y - each.b) - out), cellAt(Math.max(was.y + was.b, each.y + each.b) + 5 + out));
    });
    reachable = reachableFrom(spawn);
    layAgain(rand, washedAway, flooded.acorns);

    // ---- the south-west and the landmarks (1.17) ----
    // After the ponds grow, with random numbers of its own: the landmarks
    // where they were fitted, clearing what stood on their ground as the ponds
    // did; then reeds and cattails at the water's edge, lily pads on the
    // ponds, and leaf piles under broadleaf trees.
    const later = seededRandom(SEED + 117);
    const added = { props: [], acorns: [] };
    const madeRoom = new Set();
    const footprints = LANDMARKS.map((one) => one.ground.map(([dx, dy, r]) => ({ x: one.x + dx, y: one.y + dy, r })));
    const ground = footprints.flat();
    // A flower or the like just behind a landmark would be half hidden by it: that goes too.
    const behindAPicture = (prop) => LANDMARKS.some((one) => {
      const picture = Scenery.props[one.sprite].frames[0];
      return Math.abs(prop.x - one.x) < picture.width / 2 && prop.y < one.y && prop.y > one.y - picture.height;
    });
    clearAway((prop) => {
      const own = solids.filter((solid) => solid.owner === prop);
      if (own.length) return own.some((solid) => ground.some((spot) => Math.hypot(solid.x - spot.x, solid.y - spot.y) < solid.r + spot.r + 8));
      return ground.some((spot) => Math.hypot(prop.x - spot.x, prop.y - spot.y) < spot.r + (prop.sprite === 'tuft' ? 5 : 8)) || behindAPicture(prop);
    }, madeRoom, added.props);
    LANDMARKS.forEach((one, i) => {
      const prop = { sprite: one.sprite, x: one.x, y: one.y };
      props.push(prop);
      for (const spot of footprints[i]) {
        taken.push(spot);
        if (one.solid) solids.push({ x: spot.x, y: spot.y, r: spot.r, owner: prop });
      }
      const picture = Scenery.props[one.sprite].frames[0];
      landmarks.push({ x: one.x, y: one.y, half: picture.width / 2, height: picture.height });
    });

    // Reeds and cattails: clumps along parts of each pond's shore, standing in
    // the shallows where the water is drawn to end, and along the stream's
    // banks; never in the hedge, on a path, by a bridge or the waterfall's
    // pool, beside an acorn or a trunk, or crowding another clump.
    const reedSpots = [];
    const reedRoom = (x, y) => x > BORDER + 6 && x < SIZE - BORDER - 6 && y > BORDER + 8 && y < SIZE - BORDER - 8 && !onPath(x, y, 6)
      && streams.every(({ bridge }) => Math.hypot(x - bridge.x, y - bridge.y) > 26)
      && Math.hypot(x - falls.x, y - falls.y) > 36 && !onMountain(x, y, 6)
      && acorns.every((acorn) => Math.hypot(x - acorn.x, y - acorn.y) > 12)
      && solids.every((solid) => Math.hypot(x - solid.x, y - solid.y) > solid.r + 6)
      && reedSpots.every((spot) => Math.hypot(x - spot.x, y - spot.y) > REEDS.apart);
    const addReeds = (x, y) => {
      reedSpots.push({ x, y });
      props.push({ sprite: REEDS.kinds[Math.floor(later() * REEDS.kinds.length)], x, y });
    };
    ponds.forEach((each, index) => {
      for (let count = 0, attempt = 0; attempt < 300 && count < REEDS.ponds[index]; attempt++) {
        const t = later() * TAU;
        // Where pondWater draws the edge of the water, along this way out from the middle.
        const k = 0.97 / Math.sqrt(1 + 0.05 * Math.sin(6 * Math.atan2(each.b * Math.sin(t), each.a * Math.cos(t))));
        const x = Math.round(each.x + Math.cos(t) * each.a * k);
        const y = Math.round(each.y + Math.sin(t) * each.b * k);
        if (streamPoints.some((point) => Math.hypot(x - point.x, y - point.y) < point.half + 12) || !reedRoom(x, y)) continue;
        addReeds(x, y);
        count++;
      }
    });
    for (let count = 0, attempt = 0; attempt < 300 && count < REEDS.stream; attempt++) {
      const stretch = streams[Math.floor(later() * streams.length)];
      const i = Math.floor(later() * stretch.points.length);
      const at = stretch.points[i];
      const ahead = stretch.points[Math.min(stretch.points.length - 1, i + 2)];
      const behind = stretch.points[Math.max(0, i - 2)];
      const length = Math.hypot(ahead.x - behind.x, ahead.y - behind.y) || 1;
      const side = later() < 0.5 ? -1 : 1;
      const x = Math.round(at.x - (side * (ahead.y - behind.y) * (at.half + 0.5)) / length);
      const y = Math.round(at.y + (side * (ahead.x - behind.x) * (at.half + 0.5)) / length);
      if ((stretch === streams[0] && at.s < 34) || inAnyPond(x, y, 6) || !reedRoom(x, y)) continue;
      addReeds(x, y);
      count++;
    }

    // Lily pads: a few clusters on each pond, towards the shore but in the
    // water, below the top hedge, and clear of the stream where it runs in and out.
    const pads = [];
    ponds.forEach((each, index) => {
      for (let clusters = 0, attempt = 0; attempt < 120 && clusters < PADS.clusters[index]; attempt++) {
        const t = later() * TAU;
        const k = 0.6 + later() * 0.17;
        const x = each.x + Math.cos(t) * each.a * k;
        const y = each.y + Math.sin(t) * each.b * k;
        if (y < BORDER + 28 || streamPoints.some((point) => Math.hypot(x - point.x, y - point.y) < 26)
          || pads.some((pad) => Math.hypot(x - pad.x, y - pad.y) < 34)) continue;
        clusters++;
        const count = PADS.each[0] + Math.floor(later() * (PADS.each[1] - PADS.each[0] + 1));
        for (let placed = 0, tries = 0; placed < count && tries < 40; tries++) {
          const px = Math.round(x + (later() - 0.5) * 20);
          const py = Math.round(y + (later() - 0.5) * 11);
          const n = ((px - each.x) / each.a) ** 2 + ((py - each.y) / each.b) ** 2;
          if (n > 0.78 || n < 0.25 || py < BORDER + 24 || pads.some((pad) => Math.hypot(px - pad.x, py - pad.y) < 7)) continue;
          pads.push({ pond: index, x: px, y: py, r: 2.6 + later() * 1.5, notch: later() * TAU, flower: later() < 0.3, pink: later() < 0.4, phase: Math.floor(later() * 4) });
          placed++;
        }
      }
    });

    // Leaf piles under the broadleaf trees: in front of or beside a trunk, on
    // open ground, spread across the park; never on a path, near the start,
    // by an acorn, under a tree top or a landmark, or crowding anything else.
    const owners = new Set(solids.map((solid) => solid.owner));
    const mixed = (list) => list.map((item) => [later(), item]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
    for (const tree of mixed(trees.filter((each) => Scenery.props[each.sprite].leaves))) {
      if (pileSpots.length >= PILES.count) break;
      for (let attempt = 0; attempt < 6; attempt++) {
        const x = Math.round(tree.x + (later() < 0.5 ? -1 : 1) * (5 + later() * 13));
        const y = Math.round(tree.y + 4 + later() * 10);
        if (!inPark(x, y, 12) || inFeature(x, y, 12) || onPath(x, y, 6) || hiddenByTree(x, y) || behindCabin(x, y) || behindLandmark(x, y)
          || Math.hypot(x - spawn.x, y - spawn.y) < PILES.fromStart
          || solids.some((solid) => Math.hypot(x - solid.x, y - solid.y) < solid.r + 9)
          || props.some((prop) => prop.sprite !== 'tuft' && !owners.has(prop) && Math.hypot(x - prop.x, y - prop.y) < 11)
          || acorns.some((acorn) => Math.hypot(x - acorn.x, y - acorn.y) < PILES.fromAcorns + 2)
          || pileSpots.some((spot) => Math.hypot(x - spot.x, y - spot.y) < PILES.apart)) continue;
        props.push({ sprite: 'leafPile', x, y, pile: pileSpots.length });
        pileSpots.push({ x, y });
        break;
      }
    }
    // Grass tufts don't poke up through a clump of reeds or a pile of leaves.
    clearAway((prop) => prop.sprite === 'tuft' && reedSpots.concat(pileSpots).some((spot) => Math.hypot(prop.x - spot.x, prop.y - spot.y) < 6), madeRoom, added.props);

    // The route grid round each landmark creatures go round, then the acorns.
    for (const one of LANDMARKS.filter((each) => each.solid)) {
      fillCells(cellAt(one.x - 48), cellAt(one.x + 48), cellAt(one.y - 60), cellAt(one.y + 48));
    }
    reachable = reachableFrom(spawn);
    layAgain(later, madeRoom, added.acorns);
    props.sort((a, b) => a.y - b.y);

    // ---- the hedged field and its meadow (1.18) ----
    // After the landmarks, with random numbers of its own. The hedge's line is
    // a smooth curve from beyond the west hedge to beyond the south one, solid
    // as a chain of short strips (like the stream's banks) but for the gate and
    // the gap. Whatever stands on its line, or in the meadow but for the trees
    // and rocks there (they stand on in the long grass), is cleared; the five
    // acorns lying in the open nearest the field are laid again in the meadow,
    // each in its own place in the list; then any acorn the hedge crowds is laid again.
    const fieldRandom = seededRandom(SEED + 118);
    const fieldTook = { props: [], acorns: [] };
    const hedgeLine = smoothCourse(HEDGEROW.course.map(([x, y]) => ({ x, y })));
    const inAGap = (s) => HEDGEROW.gaps.some(([from, to]) => s >= from && s <= to);
    for (let i = 0; i < hedgeLine.length - 1; i += 3) {
      const a = hedgeLine[i];
      const b = hedgeLine[Math.min(hedgeLine.length - 1, i + 3)];
      if (inAGap((a.s + b.s) / 2)) continue;
      const reach = HEDGEROW.half + 0.5;
      hedgeStrips.push({ a, b, reach, left: Math.min(a.x, b.x) - reach, right: Math.max(a.x, b.x) + reach, top: Math.min(a.y, b.y) - reach, bottom: Math.max(a.y, b.y) + reach });
    }
    // The field, inside the hedge's line and the park's corner, as a mask of
    // the park's pixels over a box round it, filled row by row; the meadow is
    // the field less a strip along the hedge (its half-width and a pixel more).
    const fieldBox = { left: 0, top: Math.floor(Math.min(...hedgeLine.map((p) => p.y))) - 2, right: Math.ceil(Math.max(...hedgeLine.map((p) => p.x))) + 2, bottom: SIZE - 1 };
    const boxW = fieldBox.right - fieldBox.left + 1;
    const boxH = fieldBox.bottom - fieldBox.top + 1;
    const field = new Uint8Array(boxW * boxH);
    const outline = hedgeLine.filter((point, i) => i % 3 === 0 || i === hedgeLine.length - 1).concat([{ x: -20, y: SIZE + 20 }, { x: -20, y: hedgeLine[0].y }]);
    for (let row = 0; row < boxH; row++) {
      const y = fieldBox.top + row + 0.5;
      const crossings = [];
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        if ((a.y <= y) !== (b.y <= y)) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      crossings.sort((p, q) => p - q);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        for (let x = Math.max(fieldBox.left, Math.ceil(crossings[k] - 0.5)); x <= Math.min(fieldBox.right, Math.floor(crossings[k + 1] - 0.5)); x++) field[(x - fieldBox.left) + row * boxW] = 1;
      }
    }
    const meadowMask = field.slice();
    for (const p of hedgeLine.filter((point, i) => i % 2 === 0)) {
      const r = HEDGEROW.half + 1;
      for (let y = Math.floor(p.y - r); y <= Math.ceil(p.y + r); y++) {
        for (let x = Math.floor(p.x - r); x <= Math.ceil(p.x + r); x++) {
          if (x < fieldBox.left || x > fieldBox.right || y < fieldBox.top || y > fieldBox.bottom) continue;
          if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < r) meadowMask[(x - fieldBox.left) + (y - fieldBox.top) * boxW] = 0;
        }
      }
    }
    const maskAt = (mask, x, y) => {
      const col = Math.floor(x) - fieldBox.left;
      const row = Math.floor(y) - fieldBox.top;
      return col >= 0 && row >= 0 && col < boxW && row < boxH && mask[col + row * boxW] === 1;
    };
    inField = (x, y) => maskAt(field, x, y);
    inMeadow = (x, y) => x >= BORDER && y >= BORDER && x < SIZE - BORDER && y < SIZE - BORDER && maskAt(meadowMask, x, y);
    // The meadow's box in the park, for whoever draws it.
    const meadowBox = { left: SIZE, top: SIZE, right: 0, bottom: 0 };
    for (let row = 0; row < boxH; row++) {
      const y = fieldBox.top + row;
      if (y < BORDER || y >= SIZE - BORDER) continue;
      for (let col = 0; col < boxW; col++) {
        const x = fieldBox.left + col;
        if (!meadowMask[col + row * boxW] || x < BORDER) continue;
        if (x < meadowBox.left) meadowBox.left = x;
        if (x > meadowBox.right) meadowBox.right = x;
        if (y < meadowBox.top) meadowBox.top = y;
        if (y > meadowBox.bottom) meadowBox.bottom = y;
      }
    }

    // What the hedge and the meadow take: anything solid within 3 px of the
    // hedge (trees stand close by a hedgerow), and anything else on its line or
    // in the meadow (flowers, mushrooms, tufts, a leaf pile); not the trees and
    // rocks in the field, which stand on in the long grass.
    const fieldMade = new Set();
    clearAway((prop) => {
      const own = solids.filter((solid) => solid.owner === prop);
      if (own.length) return own.some((solid) => inHedgerow(solid.x, solid.y, solid.r + 3));
      return inHedgerow(prop.x, prop.y, prop.sprite === 'tuft' ? 4 : 8) || inMeadow(prop.x, prop.y) || inMeadow(prop.x, prop.y - 4);
    }, fieldMade, fieldTook.props);
    // The leaf piles left, numbered again.
    pileSpots.length = 0;
    for (const prop of props.filter((each) => each.sprite === 'leafPile')) {
      prop.pile = pileSpots.length;
      pileSpots.push({ x: prop.x, y: prop.y });
    }
    // The hedge: a clump every few pixels along its line inside the park, but
    // for the gate and the gap; an open gate in the first, its posts either side.
    const pointAt = (s) => hedgeLine.find((point) => point.s >= s) || hedgeLine[hedgeLine.length - 1];
    for (let s = 1; s < hedgeLine[hedgeLine.length - 1].s; s += HEDGEROW.clumpEvery) {
      if (inAGap(s)) continue;
      const p = pointAt(s);
      if (p.x < BORDER - 6 || p.y > SIZE - BORDER + 6) continue;   // in the park's own hedge
      props.push({ sprite: HEDGEROW.clumps[Math.floor(fieldRandom() * HEDGEROW.clumps.length)], x: Math.round(p.x), y: Math.round(p.y + HEDGEROW.half - 1) });
    }
    const gateAt = pointAt((HEDGEROW.gaps[0][0] + HEDGEROW.gaps[0][1]) / 2);
    props.push({ sprite: 'gate', x: Math.round(gateAt.x), y: Math.round(gateAt.y + HEDGEROW.half) });

    // The route grid over the field and round it, with the hedge in it and
    // the meadow slower going; then what can be reached from the start.
    const lastCol = cellAt(fieldBox.right) + 6;
    const firstRow = cellAt(fieldBox.top) - 6;
    for (let row = Math.max(0, firstRow); row < COLS; row++) {
      for (let col = 0; col <= Math.min(COLS - 1, lastCol); col++) {
        slowness[col + row * COLS] = inMeadow((col + 0.5) * CELL, (row + 0.5) * CELL) ? 1 / MEADOW_PACE : 1;
      }
    }
    fillCells(0, lastCol, firstRow, COLS - 1);
    reachable = reachableFrom(spawn);

    // The five acorns lying in the open nearest the field (outside it), laid
    // again in its meadow, each in its own place in the list. Those tucked
    // beside a trunk or a bush stay, so there are as many of those as ever.
    const fromTheField = (acorn) => Math.min(...hedgeLine.map((p) => Math.hypot(acorn.x - p.x, acorn.y - p.y)));
    const nearest = acorns.map((acorn, index) => ({ acorn, index, away: fromTheField(acorn) }))
      .filter((each) => !inField(each.acorn.x, each.acorn.y) && !tuckedBy.has(each.acorn)).sort((a, b) => a.away - b.away).slice(0, FIELD_ACORNS)
      .sort((a, b) => b.index - a.index);
    const vacated = [];
    for (const { acorn, index } of nearest) {
      fieldTook.acorns.push([acorn.x, acorn.y]);
      acorns.splice(index, 1);
      vacated.unshift(index);
    }
    const kept = acorns.length;
    for (let attempt = 0; attempt < 3000 && acorns.length < kept + vacated.length; attempt++) {
      const x = Math.round(meadowBox.left + fieldRandom() * (meadowBox.right - meadowBox.left));
      const y = Math.round(meadowBox.top + fieldRandom() * (meadowBox.bottom - meadowBox.top));
      if (inMeadow(x, y) && inMeadow(x, y - 10)) tryAcorn(x, y);
    }
    acorns.splice(kept).forEach((acorn, k) => acorns.splice(vacated[k], 0, acorn));
    // Any other acorn the hedge now crowds, laid again elsewhere.
    layAgain(fieldRandom, fieldMade, fieldTook.acorns);
    props.sort((a, b) => a.y - b.y);

    const landmarkAt = (sprite) => LANDMARKS.filter((one) => one.sprite === sprite).map(({ x, y }) => ({ x, y }));
    return {
      size: SIZE, tile: TILE, border: BORDER, spawn, pond, ponds, streams, mountain, falls, paths, logs, props, acorns, cabin,
      pushOut, blocked, standsClear, nearestWater, acornFits, newAcornSpot, wayTo, nearestByWay, clearLine, distancesFrom, distanceTo, onPath,
      // The landmarks (1.17): the mill, the well, the signpost, the benches and
      // the bird bath; lily pads on the ponds, as { pond, x, y, r, notch,
      // flower, pink, phase }; and the leaf piles (each pile's prop carries its
      // number in this list as `pile`).
      mill: landmarkAt('mill')[0], well: landmarkAt('well')[0], signpost: landmarkAt('signpost')[0], birdBath: landmarkAt('birdBath')[0],
      benches: landmarkAt('bench'), pads, piles: pileSpots, reeds: reedSpots,
      // The hedged field (1.18): where its meadow and field are, how fast everyone
      // goes in the long grass, the hedge's line and its gaps, the meadow's box.
      inMeadow, inField, meadowPace: MEADOW_PACE, hedgerow: { line: hedgeLine, gaps: HEDGEROW.gaps, half: HEDGEROW.half }, meadow: meadowBox,
      // For tests: the copses, the cabin's walls, what the ponds took as they
      // grew and the landmarks took as they went up, and the route grid.
      copses: copses.map((copse) => ({ x: copse.x, y: copse.y, radius: copse.radius, trees: copse.trees.length })),
      boxes, flooded, added, fieldTook,
      grid: { cell: CELL, cols: COLS, open, isOpen: (x, y) => open[cellOf(x, y)] === 1 },
    };
  }

  return { generate };
})();
