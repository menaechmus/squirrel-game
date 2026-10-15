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

  // The south of the park, added later from a seed of its own so that the rest
  // of the park stayed where it was: a rocky hill with a waterfall, the stream
  // it feeds, a second pond, a log bridge over the stream, and logs about the park.
  const SOUTH_SEED = 20261014;
  const HILL_AT = { x: 690, y: 705 };                     // the middle of the hill's foot
  const SMALL_POND = { x: 590, y: 864, a: 36, b: 22 };
  // The stream's course from the foot of the waterfall to the pond, smoothed into a curve.
  const STREAM_COURSE = [[672, 706], [668, 730], [662, 752], [659, 772], [655, 792], [642, 812], [622, 830], [604, 845]];
  const STREAM_HALF = 3.5;    // half the stream's width
  const BRIDGE = { along: 66, length: 26, gap: 28 };      // how far down the stream, how long its logs, how much of the stream it spans
  const LOG_COUNT = 10;
  const LOGS = ['logLong', 'logLong', 'logLongL', 'logShort', 'logShortL', 'logShortL'];

  // Finding the way: the park as a grid of cells a creature can or cannot stand in.
  const CELL = 8;
  const CLEARANCE = 5;        // a route keeps a creature's middle this far beyond anything solid

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

    let props = [];
    let solids = [];
    for (const group of SCENERY) {
      for (let i = 0; i < group.count; i++) {
        const spot = freeSpot(group.spacing);
        if (!spot) break;
        const sprite = group.sprites[Math.floor(rand() * group.sprites.length)];
        props.push({ sprite, x: spot.x, y: spot.y });
        if (SOLID[sprite]) solids.push({ x: spot.x, y: spot.y - SOLID[sprite][1], r: SOLID[sprite][0], owner: props[props.length - 1] });
      }
    }

    // An acorn is unfair if a tree further down the screen draws over it.
    const trees = props.filter((prop) => Scenery.props[prop.sprite].hides);
    const hiddenByTree = (x, y) => trees.some((tree) => {
      const sprite = Scenery.props[tree.sprite].frames[0];
      return Math.abs(x - tree.x) < sprite.width / 2 && y < tree.y && y > tree.y - sprite.height - 4;
    });
    let acorns = [];
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
    const shuffled = (list, random = rand) => list.map((item) => [random(), item]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
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

    // ---- the south: the hill, its stream, the second pond, the bridge, and logs ----
    // Everything up to here is exactly as it was before these were added.
    const southRandom = seededRandom(SOUTH_SEED);
    const smallPond = { x: SMALL_POND.x, y: SMALL_POND.y, a: SMALL_POND.a, b: SMALL_POND.b };
    const ponds = [pond, smallPond];
    const inAnyPond = (x, y, pad) => ponds.some((each) => ((x - each.x) / (each.a + pad)) ** 2 + ((y - each.y) / (each.b + pad)) ** 2 < 1);

    // The stream: a smooth curve through its course, a point every pixel or so,
    // each with its distance `s` downstream.
    const course = STREAM_COURSE.map(([x, y]) => ({ x, y }));
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
    points.push(course[course.length - 1]);
    points[0].s = 0;
    for (let i = 1; i < points.length; i++) points[i].s = points[i - 1].s + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const bridgePoint = points.find((point) => point.s >= BRIDGE.along);
    const stream = { points, half: STREAM_HALF, bridge: { x: bridgePoint.x, y: bridgePoint.y, s: bridgePoint.s, length: BRIDGE.length, gap: BRIDGE.gap } };
    const nearStream = (x, y, pad) => points.some((point) => Math.hypot(x - point.x, y - point.y) < STREAM_HALF + pad);

    // Water that cannot be walked through: the stream as a chain of short
    // strips, each `reach` wide either side of its line, broken under the bridge.
    const banks = [];
    for (let i = 0; i < points.length - 1; i += 3) {
      const a = points[i];
      const b = points[Math.min(points.length - 1, i + 3)];
      if (Math.abs((a.s + b.s) / 2 - stream.bridge.s) < BRIDGE.gap / 2) continue;
      banks.push({ a, b, reach: STREAM_HALF + 0.5 });
    }
    // The nearest point to (x, y) on a strip's line.
    const closestOn = (strip, x, y) => {
      const dx = strip.b.x - strip.a.x;
      const dy = strip.b.y - strip.a.y;
      const along = Math.max(0, Math.min(1, ((x - strip.a.x) * dx + (y - strip.a.y) * dy) / (dx * dx + dy * dy || 1)));
      return { x: strip.a.x + dx * along, y: strip.a.y + dy * along };
    };
    const inStream = (x, y, radius) => banks.some((strip) => {
      const near = closestOn(strip, x, y);
      return Math.hypot(x - near.x, y - near.y) < strip.reach + radius;
    });

    // The hill: solid across its foot, an ellipse running back about 44 pixels from its front.
    const hillArt = Scenery.props.hill;
    const hillSprite = hillArt.frames[0];
    const hill = { x: HILL_AT.x, y: HILL_AT.y, w: hillSprite.width, h: hillSprite.height };
    const hillFoot = { x: HILL_AT.x, y: HILL_AT.y - 22, a: hillSprite.width / 2 - 4, b: 22 };
    const onHill = (x, y, pad) => ((x - hillFoot.x) / (hillFoot.a + pad)) ** 2 + ((y - hillFoot.y) / (hillFoot.b + pad)) ** 2 < 1;
    // Behind the hill (further up the screen, under its picture) a creature or acorn is out of sight.
    const behindHill = (x, y) => Math.abs(x - hill.x) < hill.w / 2 && y < hill.y && y > hill.y - hill.h - 4;
    // In front of the waterfall nothing should stand between it and the player.
    const fallsX = hill.x + hillArt.falls.dx;
    const beforeFalls = (x, y, half) => Math.abs(x - fallsX) < half && y >= hill.y && y < hill.y + 28;
    const inSmallPond = (x, y, pad) => ((x - smallPond.x) / (smallPond.a + pad)) ** 2 + ((y - smallPond.y) / (smallPond.b + pad)) ** 2 < 1;
    const southFeature = (x, y, pad) => onHill(x, y, pad) || nearStream(x, y, pad) || inSmallPond(x, y, pad);

    // Clear the ground for them: whatever stood there goes.
    const reach = (prop) => (SOLID[prop.sprite] ? SOLID[prop.sprite][0] + 6 : prop.sprite === 'tuft' ? 2 : 6);
    const removed = new Set(props.filter((prop) => southFeature(prop.x, prop.y, reach(prop))
      || (Scenery.props[prop.sprite].hides && beforeFalls(prop.x, prop.y, Scenery.props[prop.sprite].frames[0].width / 2 + 4))
      || (prop.sprite !== 'tuft' && behindHill(prop.x, prop.y) && prop.y > hill.y - 44)));
    props = props.filter((prop) => !removed.has(prop));
    solids = solids.filter((solid) => !removed.has(solid.owner));
    props.push({ sprite: 'hill', x: hill.x, y: hill.y }, { sprite: 'falls', x: fallsX, y: hill.y + 2 });
    for (let x = hillFoot.x - hillFoot.a + 10; x <= hillFoot.x + hillFoot.a - 10; x += 14) taken.push({ x, y: hillFoot.y, r: hillFoot.b + 8 });
    for (const point of points.filter((each, index) => index % 6 === 0)) taken.push({ x: point.x, y: point.y, r: STREAM_HALF + 10 });
    taken.push({ x: smallPond.x, y: smallPond.y, r: smallPond.a + 12 });

    // Logs about the park, each solid along its length.
    const logs = [];
    for (let attempt = 0; attempt < 400 && logs.length < LOG_COUNT; attempt++) {
      const x = Math.round(BORDER + 30 + southRandom() * (SIZE - 2 * BORDER - 60));
      const y = Math.round(BORDER + 40 + southRandom() * (SIZE - 2 * BORDER - 60));
      const sprite = LOGS[Math.floor(southRandom() * LOGS.length)];
      if (!taken.every((other) => Math.hypot(x - other.x, y - other.y) >= 18 + other.r) || inAnyPond(x, y, 26) || behindHill(x, y)) continue;
      taken.push({ x, y, r: 18 });
      props.push({ sprite, x, y });
      const half = Scenery.props[sprite].frames[0].width / 2 - 5;
      for (let along = -half; along <= half + 0.01; along += (2 * half) / Math.ceil((2 * half) / 7)) solids.push({ x: x + along, y: y - 5, r: 5 });
      logs.push({ x, y });
    }
    props.sort((a, b) => a.y - b.y);

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
          outOfEllipse(hillFoot.x, hillFoot.y, hillFoot.a + radius, hillFoot.b + radius);
        }
        // Off the stream's line, square to it.
        for (const strip of banks) {
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

    // Is a circle here touching scenery, water or the hedge?
    function blocked(x, y, radius) {
      return !inPark(x, y, radius) || inAnyPond(x, y, radius + 6)
        || solids.some((solid) => Math.hypot(x - solid.x, y - solid.y) < solid.r + radius)
        || onHill(x, y, radius) || inStream(x, y, radius);
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
        open[col + row * COLS] = inside && !onHill(x, y, CLEARANCE) && !inStream(x, y, CLEARANCE)
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

    // ---- acorns that stood where the new features are go somewhere else ----
    const reachable = distancesFrom(spawn);
    const canReach = (x, y) => {
      for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const cell = cellOf(x + dx, y - 3 + dy);
        if (open[cell] && reachable.dist[cell] < Infinity) return true;
      }
      return false;
    };
    const bushes = props.filter((prop) => prop.sprite.startsWith('bush'));
    const wasTucked = (acorn, list) => list.some((prop) => Math.hypot(prop.x - acorn.x, prop.y - acorn.y) < 15);
    const moved = acorns.filter((acorn) => southFeature(acorn.x, acorn.y, 13) || behindHill(acorn.x, acorn.y)
      || blocked(acorn.x, acorn.y, 3) || !canReach(acorn.x, acorn.y));
    const kinds = moved.map((acorn) => (wasTucked(acorn, trees) ? 'tree' : wasTucked(acorn, bushes) ? 'bush' : 'open'));
    acorns = acorns.filter((acorn) => !moved.includes(acorn));
    const fits = (x, y) => !southFeature(x, y, 13) && !behindHill(x, y) && !blocked(x, y, 6) && canReach(x, y);
    const standing = new Set(props);
    for (const kind of kinds) {
      let done = false;
      if (kind !== 'open') {
        const beside = kind === 'tree' ? trees : bushes;
        const offset = kind === 'tree' ? [12, 3] : [13, 2];
        for (const prop of shuffled(beside.filter((each) => standing.has(each)), southRandom)) {
          const x = prop.x + (southRandom() < 0.5 ? -offset[0] : offset[0]);
          const y = prop.y + offset[1];
          if (fits(x, y) && tryAcorn(x, y, true)) { done = true; break; }
        }
      }
      for (let attempt = 0; !done && attempt < 3000; attempt++) {
        const x = Math.round(BORDER + 12 + southRandom() * (SIZE - 2 * BORDER - 24));
        const y = Math.round(BORDER + 24 + southRandom() * (SIZE - 2 * BORDER - 36));
        if (fits(x, y) && tryAcorn(x, y)) done = true;
      }
    }

    return {
      size: SIZE, tile: TILE, border: BORDER, spawn, pond, ponds, stream, hill, logs, props, acorns, pushOut, blocked,
      wayTo, nearestByWay, clearLine, distancesFrom, distanceTo,
      // For tests: the route grid, and which acorns had to move for the new features.
      grid: { cell: CELL, cols: COLS, open, isOpen: (x, y) => open[cellOf(x, y)] === 1 }, movedAcorns: moved.length,
    };
  }

  return { generate };
})();
