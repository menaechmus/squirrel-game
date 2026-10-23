// Life on the water (1.15): fish and ducks, only for show, like the jays that
// land and the groundhogs that pop up (rivals.js). Fish swim under the surface
// of both ponds and in the stream, and now and then one leaps clear; mallards
// float on the ponds, paddling, bobbing and up-ending to feed, and now and
// then one flies off or another flies in. Nothing here touches an acorn, and
// it has random numbers of its own (the game seeds it from a stream that is
// not the thieves'), so the thieves behave exactly the same. What is meant to
// be seen (a leap, a take-off, a landing) only happens where the player can
// see it.
//
// The game hands in a `world`:
//   level, player, view() -> the part of the park on screen, as { x, y, w, h },
//   splash(spot) -> throw up a few drops of water there.

const WaterLife = (() => {
  // Every number that decides how the fish and ducks behave. Times are
  // seconds, distances and speeds game pixels.
  const TUNING = {
    shallows: 14,             // however big a pond, fish and ducks come within this far of its shore (1.16)
    fish: {
      inPonds: [5, 3],        // fish in each pond...
      goldfish: [1, 1],       // ...of which goldfish
      deep: 0.68,             // pond fish keep within this share of the pond's size, clear of the shore...
      belowHedge: 8,          // ...and this far below the top hedge, where the first pond runs out through it (1.16)
      speed: [5, 12],         // cruising
      rest: [0.6, 2.6],       // still between swims
      turn: 3.5,              // how fast one turns, in radians a second
    },
    leap: {
      first: [1.5, 4],        // the first leap after a fish comes into view
      gap: [3.5, 8],          // between leaps, while a fish is in view
      time: 0.62,             // in the air
      height: 12,             // at the top of the arc
      reach: 11,              // along the water while in the air
    },
    ducks: {
      start: [3, 1],          // on each pond as a round begins...
      least: [2, 1],          // ...and never fewer...
      most: [4, 2],           // ...or more
      deep: 0.66,
      belowHedge: 16,         // so a duck's picture never reaches the hedge
      spacing: [18, 11],      // floating ducks keep this far apart across the screen and up it (a duck is 16 by 10)
      paddle: [3, 7],
      rest: [1.5, 5],         // still between paddles
      dipEvery: [8, 22],      // seconds between up-ending to feed...
      dip: [1.2, 2.4],        // ...and how long the tail stays up
      calm: 36,               // a squirrel this close sends a duck paddling away...
      away: 11,               // ...at this speed
      firstSight: [3, 9],     // the first coming or going after the pond comes into view...
      traffic: [16, 32],      // ...and the next ones, while it stays in view
      run: 0.55,              // pattering along the water before it lifts off
      runSpeed: 46,
      climb: 44,              // how high it flies
      speed: [70, 92],
      glide: 64,              // it starts coming down this far from where it lands
      skid: 9,                // it slides this far on landing
      skidTime: 0.45,
      lead: 2.5,              // a landing is placed where the player will still see it this long from now (flying in takes about that)
    },
  };
  const TAU = Math.PI * 2;
  const MAX_DRIFT = 120;     // ignore the player "moving" faster than this (a restart, not a run)
  // Where to look for a pond on screen, as shares of its size: its middle, and
  // enough points towards its ends to catch a tall one through a short, wide screen (1.16).
  const POND_PROBES = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0, 0.85], [0, -0.85], [0.6, 0.45], [-0.6, 0.45], [0.6, -0.45], [-0.6, -0.45]];

  function create(world) {
    const { level, player } = world;
    let random = Math.random;
    const pick = ([min, max]) => min + random() * (max - min);
    const near = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) < radius;
    // Is a spot well inside the screen, clear of the top bar? Or well outside it?
    const onScreen = (spot, view) => spot.x > view.x + 12 && spot.x < view.x + view.w - 12 && spot.y > view.y + 26 && spot.y < view.y + view.h - 8;
    const outside = (spot, view) => spot.x < view.x - 24 || spot.x > view.x + view.w + 24 || spot.y < view.y - 24 || spot.y > view.y + view.h + 24;
    // A pond's size times `share`, but in a big pond never more than the
    // shallows in from its shore (1.16).
    const reachOf = (length, share) => Math.max(length * share, length - TUNING.shallows);
    // Is a spot inside `share` of a pond's size, and, if `below` is given, that
    // far below the top hedge? (The first pond runs out through it, 1.16.)
    const inPond = (pond, x, y, share, below = null) => (below === null || y > level.border + below)
      && ((x - pond.x) / reachOf(pond.a, share)) ** 2 + ((y - pond.y) / reachOf(pond.b, share)) ** 2 < 1;
    // Somewhere inside `share` of a pond's size, `below` px below the top hedge.
    function pondSpot(pond, share, below) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const angle = random() * TAU;
        const reach = Math.sqrt(random());
        const spot = { x: pond.x + Math.cos(angle) * reachOf(pond.a, share) * reach, y: pond.y + Math.sin(angle) * reachOf(pond.b, share) * reach };
        if (spot.y > level.border + below) return spot;
      }
      return { x: pond.x, y: Math.max(pond.y, level.border + below + 1) };
    }
    // Turn `from` towards `to` (radians) by at most `most`.
    function turned(from, to, most) {
      const gap = ((to - from + Math.PI * 3) % TAU) - Math.PI;
      return from + Math.max(-most, Math.min(most, gap));
    }

    // The stream, for fish: each stretch's line with the way downstream at
    // every point, and the reaches a fish may keep to: the calm side of the
    // pool under the waterfall, and the upper stretch above and below its
    // bridge, clear of the churning water, the pond it runs into and the
    // bridge itself. (The lower stretch is too short between its bridge, the
    // pond and the hedge.)
    const inner = level.size - level.border;
    const lines = level.streams.map(({ points }) => points.map((point, i) => {
      const ahead = points[Math.min(points.length - 1, i + 2)];
      const behind = points[Math.max(0, i - 2)];
      const length = Math.hypot(ahead.x - behind.x, ahead.y - behind.y) || 1;
      return { x: point.x, y: point.y, s: point.s, half: point.half, tx: (ahead.x - behind.x) / length, ty: (ahead.y - behind.y) / length };
    }));
    // The spot `s` down a stretch and `across` (-1 to 1 of the half-width) from its line, with the way downstream there.
    function streamAt(stretch, s, across) {
      const line = lines[stretch];
      let i = 0;
      while (i < line.length - 2 && line[i + 1].s < s) i++;
      const a = line[i];
      const b = line[i + 1];
      const share = Math.max(0, Math.min(1, (s - a.s) / ((b.s - a.s) || 1)));
      const tx = a.tx + (b.tx - a.tx) * share;
      const ty = a.ty + (b.ty - a.ty) * share;
      const length = Math.hypot(tx, ty) || 1;
      const half = a.half + (b.half - a.half) * share;
      return {
        x: a.x + (b.x - a.x) * share - (ty / length) * half * across,
        y: a.y + (b.y - a.y) * share + (tx / length) * half * across,
        half, tx: tx / length, ty: ty / length,
      };
    }
    const lastS = (stretch) => lines[stretch][lines[stretch].length - 1].s;
    // How far down a stretch it is clear of the second pond and still inside the park.
    const clearOf = (stretch, from, to) => {
      let end = to;
      for (const point of lines[stretch]) {
        if (point.s < from || point.s > end) continue;
        if (point.y > inner - 14 || level.ponds.some((pond) => inPond(pond, point.x, point.y, 1.25))) end = Math.min(end, point.s - 4);
      }
      return end;
    };
    const above = (stretch) => level.streams[stretch].bridge.s - level.streams[stretch].bridge.gap / 2 - 10;
    const below = (stretch) => level.streams[stretch].bridge.s + level.streams[stretch].bridge.gap / 2 + 10;
    const reaches = [
      { stretch: 0, from: 14, to: 22, across: 0.5 },
      { stretch: 0, from: 32, to: above(0), across: 0.3 },
      { stretch: 0, from: below(0), to: clearOf(0, below(0), lastS(0)), across: 0.3 },
      { stretch: 1, from: below(1), to: clearOf(1, below(1), lastS(1)), across: 0.3 },
    ].filter((reach) => reach.to - reach.from > 6);

    let active = false;
    let fish = [];
    let ducks = [];
    let rings = [];           // splash rings and wakes, on the water
    let waters = [];          // each pond's comings and goings: { index, timer, seen }
    let leapTimer = 0;
    let fishSeen = false;     // was a fish in view at the last update?
    let clock = 0;
    let log = [];             // for tests: each leap, take-off and landing as it starts
    // Which way the player is heading (a smoothed velocity, pixels a second),
    // so a duck comes down where they will still see it.
    let drift = { x: 0, y: 0 };
    let lastSpot = { x: player.x, y: player.y };

    const say = (kind, spot) => {
      log.push({ kind, x: Math.round(spot.x), y: Math.round(spot.y), at: +clock.toFixed(2) });
      if (log.length > 400) log.shift();
    };

    // A ring of ripples on the water; a loud one is a splash, and heard.
    function ring(spot, loud) {
      rings.push({ x: spot.x, y: spot.y, age: 0, life: loud ? 0.7 : 1.1, loud });
      if (loud) world.splash(spot);
    }

    // ---- fish ----

    function pondFish(pond, gold) {
      const { deep, belowHedge } = TUNING.fish;
      const spot = pondSpot(pond, deep, belowHedge);
      return {
        pond, reach: null, gold, x: spot.x, y: spot.y, angle: random() * TAU, speed: pick(TUNING.fish.speed),
        target: pondSpot(pond, deep, belowHedge), rest: pick(TUNING.fish.rest), wiggle: random() * 2, leap: null,
      };
    }

    function streamFish(reach) {
      const s = reach.from + random() * (reach.to - reach.from);
      const across = (random() * 2 - 1) * reach.across;
      const spot = streamAt(reach.stretch, s, across);
      return {
        pond: null, reach, gold: false, x: spot.x, y: spot.y, s, across, toS: s, toAcross: across,
        angle: Math.atan2(-spot.ty, -spot.tx), speed: pick([4, 9]), rest: pick(TUNING.fish.rest), wiggle: random() * 2, leap: null,
      };
    }

    // In a pond: swim to somewhere in the deep water, rest, and again.
    function swimInPond(one, dt) {
      const tuning = TUNING.fish;
      if (one.rest > 0) {
        one.rest -= dt;
        one.wiggle += dt * 1.5;
        return;
      }
      const dx = one.target.x - one.x;
      const dy = one.target.y - one.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.5) {
        one.rest = pick(tuning.rest);
        one.target = pondSpot(one.pond, tuning.deep, tuning.belowHedge);
        one.speed = pick(tuning.speed);
        return;
      }
      one.angle = turned(one.angle, Math.atan2(dy, dx), tuning.turn * dt);
      // Forwards only, and slower while it is still turning to face the way.
      const facing = Math.cos(Math.atan2(dy, dx) - one.angle);
      const step = Math.min(distance, one.speed * dt * Math.max(0.2, facing));
      const x = one.x + Math.cos(one.angle) * step;
      const y = one.y + Math.sin(one.angle) * step;
      if (inPond(one.pond, x, y, tuning.deep + 0.04, tuning.belowHedge)) {
        one.x = x;
        one.y = y;
      } else {
        one.target = pondSpot(one.pond, tuning.deep, tuning.belowHedge);   // the shallows, or the hedge: turn back
      }
      one.wiggle += dt * (2 + one.speed * 0.5);
    }

    // In the stream: hold against the current, nose upstream, now and then
    // moving a little way up or down its reach.
    function swimInStream(one, dt) {
      const { reach } = one;
      const ds = one.toS - one.s;
      const moving = Math.abs(ds) > 0.5;
      if (moving) one.s += Math.sign(ds) * Math.min(Math.abs(ds), one.speed * dt);
      one.across += (one.toAcross - one.across) * Math.min(1, dt * 1.5);
      const spot = streamAt(reach.stretch, one.s, one.across);
      one.x = spot.x;
      one.y = spot.y;
      const want = moving && ds > 0 ? Math.atan2(spot.ty, spot.tx) : Math.atan2(-spot.ty, -spot.tx);
      one.angle = turned(one.angle, want, TUNING.fish.turn * dt);
      one.wiggle += dt * (moving ? 4 : 2.5);   // it keeps finning against the current
      if (moving) return;
      one.rest -= dt;
      if (one.rest > 0) return;
      one.rest = pick([1.5, 5]);
      one.toS = Math.max(reach.from, Math.min(reach.to, one.s + (random() * 2 - 1) * 14));
      one.toAcross = (random() * 2 - 1) * reach.across;
      one.speed = pick([4, 9]);
    }

    // Is a spot water a fish may swim in?
    function fishWater(one, spot) {
      if (one.pond) return inPond(one.pond, spot.x, spot.y, TUNING.fish.deep + 0.04, TUNING.fish.belowHedge);
      return true;   // a stream fish comes down on its own reach (see startLeap)
    }

    // A fish in view leaps clear of the water and comes down a little way on.
    function startLeap(one) {
      const tuning = TUNING.leap;
      const ahead = Math.cos(one.angle) >= 0 ? 1 : -1;
      for (const way of [ahead, -ahead]) {
        let to;
        let toS = null;
        if (one.pond) {
          to = { x: one.x + way * tuning.reach, y: one.y + Math.sin(one.angle) * tuning.reach * 0.3 };
        } else {
          // Along its reach of the stream, whichever way takes it towards `way` across the screen.
          const here = streamAt(one.reach.stretch, one.s, one.across);
          toS = one.s + Math.sign(here.tx * way || way) * tuning.reach;
          if (toS < one.reach.from || toS > one.reach.to) continue;
          to = streamAt(one.reach.stretch, toS, one.across);
        }
        if (!fishWater(one, to)) continue;
        one.leap = { t: 0, from: { x: one.x, y: one.y }, to: { x: to.x, y: to.y }, toS, facing: to.x >= one.x ? 'right' : 'left' };
        ring(one, true);
        say('leap', one);
        return true;
      }
      return false;
    }

    function updateFish(dt, view) {
      for (const one of fish) {
        if (one.leap) {
          const leap = one.leap;
          leap.t += dt;
          const share = Math.min(1, leap.t / TUNING.leap.time);
          one.x = leap.from.x + (leap.to.x - leap.from.x) * share;
          one.y = leap.from.y + (leap.to.y - leap.from.y) * share;
          if (share >= 1) {
            if (leap.toS !== null) one.s = one.toS = leap.toS;
            one.leap = null;
            one.rest = pick(TUNING.fish.rest);
            ring(one, true);
          }
          continue;
        }
        if (one.pond) swimInPond(one, dt);
        else swimInStream(one, dt);
      }
      // Leaps: only while a fish is in view, the first soon after one comes into it.
      const inView = fish.filter((one) => !one.leap && onScreen(one, view));
      if (inView.length) {
        if (!fishSeen) leapTimer = Math.min(leapTimer, pick(TUNING.leap.first));
        leapTimer -= dt;
        if (leapTimer <= 0) {
          leapTimer = pick(TUNING.leap.gap);
          // Any of them, starting from one picked at random, that has water to come down in.
          const first = Math.floor(random() * inView.length);
          for (let i = 0; i < inView.length; i++) if (startLeap(inView[(first + i) % inView.length])) break;
        }
      }
      fishSeen = inView.length > 0;
    }

    // ---- ducks ----

    function makeDuck(index, spot, drake) {
      return {
        index, drake, state: 'float', x: spot.x, y: spot.y, z: 0, facing: random() < 0.5 ? 'left' : 'right',
        target: null, speed: pick(TUNING.ducks.paddle), rest: pick(TUNING.ducks.rest),
        dip: 0, nextDip: pick(TUNING.ducks.dipEvery), bob: random() * TAU, flap: random(), wake: 0, timer: 0, age: 0,
      };
    }

    // Would a duck at `a` and one at `b` overlap, or nearly?
    const crowding = (a, b) => Math.abs(a.x - b.x) < TUNING.ducks.spacing[0] && Math.abs(a.y - b.y) < TUNING.ducks.spacing[1];

    // Somewhere on pond `index` clear of the other ducks (and of where they are
    // going); `self` is the duck looking, which is no obstacle to itself.
    function openWater(index, share, also = () => true, self = null) {
      const pond = level.ponds[index];
      for (let attempt = 0; attempt < 16; attempt++) {
        const spot = pondSpot(pond, share, TUNING.ducks.belowHedge);
        const crowded = ducks.some((duck) => duck !== self && duck.index === index && duck.state !== 'rise'
          && (crowding(duck, spot) || (duck.target && crowding(duck.target, spot)) || (duck.landAt && crowding(duck.landAt, spot))));
        if (!crowded && also(spot)) return spot;
      }
      return null;
    }

    function floatAbout(duck, dt, view) {
      const tuning = TUNING.ducks;
      const pond = level.ponds[duck.index];
      duck.bob += dt * 2.2;
      // A squirrel on the bank close by: it paddles a little way off. It never takes fright and flies.
      if (duck.dip <= 0 && near(player, duck, tuning.calm) && !duck.shy) {
        const dx = duck.x - player.x;
        const dy = duck.y - player.y;
        const length = Math.hypot(dx, dy) || 1;
        let to = { x: duck.x + (dx / length) * 18, y: duck.y + (dy / length) * 18 };
        if (!inPond(pond, to.x, to.y, tuning.deep, tuning.belowHedge)) to = { x: duck.x + (pond.x - duck.x) * 0.45, y: Math.max(duck.y + (pond.y - duck.y) * 0.45, level.border + tuning.belowHedge + 1) };
        duck.target = to;
        duck.speed = tuning.away;
        duck.shy = true;   // until it gets there
      }
      if (duck.dip > 0) {
        duck.dip -= dt;
        if (duck.dip <= 0) duck.nextDip = pick(tuning.dipEvery);
        return;
      }
      duck.nextDip -= dt;
      if (duck.target) {
        const dx = duck.target.x - duck.x;
        const dy = duck.target.y - duck.y;
        const distance = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) duck.facing = dx > 0 ? 'right' : 'left';
        if (distance < 1) {
          duck.target = null;
          duck.shy = false;
          duck.rest = pick(tuning.rest);
          return;
        }
        const step = Math.min(distance, duck.speed * dt);
        duck.x += (dx / distance) * step;
        duck.y += (dy / distance) * step;
        // A small wake behind it.
        duck.wake -= dt;
        if (duck.wake <= 0) {
          duck.wake = 0.35;
          ring({ x: duck.x + (duck.facing === 'right' ? -7 : 7), y: duck.y }, false);
        }
        return;
      }
      duck.rest -= dt;
      if (duck.nextDip <= 0) {
        duck.dip = pick(tuning.dip);   // up-ends to feed
      } else if (duck.rest <= 0) {
        // A duck just out of sight paddles back into view: a big pond is not all
        // on screen at once (1.16), and ducks fly off from where they are seen,
        // so otherwise they would gather where they are not.
        const middle = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
        const handy = { x: view.x - 120, y: view.y - 120, w: view.w + 240, h: view.h + 240 };
        const drifting = !onScreen(duck, view) && !outside(duck, handy);
        const nearer = (spot) => Math.hypot(spot.x - middle.x, spot.y - middle.y) < Math.hypot(duck.x - middle.x, duck.y - middle.y) - 6;
        const spot = openWater(duck.index, tuning.deep, (each) => near(each, duck, 40) && !near(each, duck, 8) && (!drifting || nearer(each)), duck);
        if (spot) {
          duck.target = spot;
          duck.speed = pick(tuning.paddle);
        } else {
          duck.rest = pick(tuning.rest);
        }
      }
    }

    // Off it goes: pattering along the water, then up and away across the view.
    function takeOff(duck) {
      const tuning = TUNING.ducks;
      const pond = level.ponds[duck.index];
      let way = duck.facing === 'right' ? 1 : -1;
      // Room to run on the water that way? If not, the other way.
      if (!inPond(pond, duck.x + way * tuning.runSpeed * tuning.run * 0.6, duck.y, 0.9, tuning.belowHedge)) way = -way;
      duck.facing = way > 0 ? 'right' : 'left';
      duck.state = 'run';
      duck.timer = tuning.run;
      duck.dip = 0;
      duck.target = null;
      duck.way = way;
      duck.speed = 8;
      duck.splashIn = 0;
      duck.age = 0;
      duck.leaveY = -(15 + random() * 25);   // it climbs away up the screen a little, too
      ring(duck, true);
      say('take-off', duck);
    }

    // One flies in to land somewhere on pond `index` the player can see, and will still see as it comes down.
    function arrive(index, view) {
      const tuning = TUNING.ducks;
      const soon = { x: view.x + drift.x * tuning.lead, y: view.y + drift.y * tuning.lead, w: view.w, h: view.h };
      const spot = openWater(index, tuning.deep * 0.85, (each) => onScreen(each, view) && onScreen(each, soon) && !near(each, player, tuning.calm + 6));
      if (!spot) return false;
      const fromLeft = (spot.x - view.x < view.w / 2) === (random() < 0.85);
      const way = fromLeft ? 1 : -1;
      // It touches down short of its spot and slides the rest of the way.
      const touch = { x: spot.x - way * tuning.skid, y: spot.y };
      if (!inPond(level.ponds[index], touch.x, touch.y, tuning.deep, tuning.belowHedge)) return false;
      const duck = makeDuck(index, spot, random() < 0.5);
      Object.assign(duck, {
        state: 'arrive', landAt: spot, touch, way, facing: fromLeft ? 'right' : 'left',
        x: fromLeft ? view.x - 30 : view.x + view.w + 30, y: spot.y + (random() - 0.5) * 60, z: tuning.climb,
        speed: pick(tuning.speed),
      });
      ducks.push(duck);
      return true;
    }

    function updateDucks(dt, view) {
      const tuning = TUNING.ducks;
      for (const duck of ducks) {
        duck.flap += dt;
        if (duck.state === 'float') {
          floatAbout(duck, dt, view);
        } else if (duck.state === 'run') {
          // Pattering along the surface, wings going, throwing up spray.
          duck.timer -= dt;
          duck.speed = Math.min(tuning.runSpeed, duck.speed + tuning.runSpeed * 2.2 * dt);
          duck.x += duck.way * duck.speed * dt;
          duck.splashIn -= dt;
          if (duck.splashIn <= 0) {
            duck.splashIn = 0.12;
            ring(duck, false);
          }
          if (duck.timer <= 0) {
            duck.state = 'rise';
            duck.z = 1;   // clear of the water
            duck.speed = pick(tuning.speed);
          }
        } else if (duck.state === 'rise') {
          duck.age += dt;
          duck.z = Math.min(tuning.climb, duck.z + 50 * dt);
          duck.x += duck.way * duck.speed * dt;
          duck.y += (duck.leaveY / 1.5) * dt;
          if (outside({ x: duck.x, y: duck.y - duck.z }, view) || duck.age > 20) duck.gone = true;
        } else if (duck.state === 'arrive') {
          // Its landing place has gone out of sight (the player ran on): it flies on over instead,
          // so that a duck never comes down where nobody sees it.
          if (!onScreen(duck.landAt, view)) {
            duck.state = 'rise';
            duck.age = 0;
            duck.leaveY = -10;
            duck.landAt = null;
            continue;
          }
          const dx = duck.touch.x - duck.x;
          const dy = duck.touch.y - duck.y;
          const distance = Math.hypot(dx, dy);
          // It glides down over the last stretch, slowing.
          const left = Math.min(1, distance / tuning.glide);
          duck.z = tuning.climb * left;
          const step = Math.min(distance, duck.speed * (0.45 + 0.55 * left) * dt);
          duck.x += (dx / (distance || 1)) * step;
          duck.y += (dy / (distance || 1)) * step;
          if (Math.abs(dx) > 1) duck.facing = dx > 0 ? 'right' : 'left';
          if (distance < 0.5) {
            duck.state = 'skid';
            duck.z = 0;
            duck.timer = tuning.skidTime;
            ring(duck, true);
            say('landing', duck);
          }
        } else if (duck.state === 'skid') {
          duck.timer -= dt;
          const share = Math.max(0, duck.timer / tuning.skidTime);
          duck.x = duck.landAt.x - duck.way * tuning.skid * share * share;
          duck.y = duck.landAt.y;
          if (duck.timer <= 0) {
            duck.state = 'float';
            duck.landAt = null;
            duck.rest = pick(tuning.rest);
          }
        }
      }
      ducks = ducks.filter((duck) => !duck.gone);

      // Comings and goings: only while the pond is in view, the first soon after it comes into view.
      for (const water of waters) {
        const pond = level.ponds[water.index];
        const visible = POND_PROBES.some(([fx, fy]) => onScreen({ x: pond.x + fx * pond.a, y: pond.y + fy * pond.b }, view));
        if (!visible) {
          water.seen = false;
          continue;
        }
        if (!water.seen) water.timer = Math.min(water.timer, pick(tuning.firstSight));
        water.seen = true;
        water.timer -= dt;
        if (water.timer > 0) continue;
        const here = ducks.filter((duck) => duck.index === water.index && duck.state !== 'rise' && duck.state !== 'run');
        // (Never one beside the squirrel, or it would look as if the squirrel had frightened it.)
        const ready = here.filter((duck) => duck.state === 'float' && duck.dip <= 0 && onScreen(duck, view) && !near(duck, player, tuning.calm + 12));
        const leave = here.length > tuning.least[water.index] && ready.length && (here.length >= tuning.most[water.index] || random() < 0.5);
        let done = false;
        if (leave) {
          takeOff(ready[Math.floor(random() * ready.length)]);
          done = true;
        } else if (here.length < tuning.most[water.index]) {
          done = arrive(water.index, view);
        }
        // Nothing to be done just now (nowhere in view to land): look again shortly.
        water.timer = done ? pick(tuning.traffic) : 2;
      }
    }

    // ---- each update ----

    function reset(seed) {
      random = seededRandom(seed);
      active = true;
      clock = 0;
      rings = [];
      log = [];
      leapTimer = pick(TUNING.leap.first);
      fishSeen = false;
      drift = { x: 0, y: 0 };
      lastSpot = { x: player.x, y: player.y };
      fish = [];
      level.ponds.forEach((pond, index) => {
        for (let i = 0; i < TUNING.fish.inPonds[index]; i++) fish.push(pondFish(pond, i < TUNING.fish.goldfish[index]));
      });
      for (const reach of reaches) fish.push(streamFish(reach));
      ducks = [];
      waters = level.ponds.map((pond, index) => ({ index, timer: pick(TUNING.ducks.firstSight), seen: false }));
      level.ponds.forEach((pond, index) => {
        for (let i = 0; i < TUNING.ducks.start[index]; i++) {
          const spot = openWater(index, TUNING.ducks.deep);
          if (spot) ducks.push(makeDuck(index, spot, i % 2 === 0));
        }
      });
    }

    function update(dt) {
      if (!active) return;
      clock += dt;
      if (dt > 0) {
        const pace = (now, before) => Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, (now - before) / dt));
        const ease = Math.min(1, dt * 5);
        drift.x += (pace(player.x, lastSpot.x) - drift.x) * ease;
        drift.y += (pace(player.y, lastSpot.y) - drift.y) * ease;
        lastSpot = { x: player.x, y: player.y };
      }
      const view = world.view();
      updateFish(dt, view);
      updateDucks(dt, view);
      for (const each of rings) each.age += dt;
      rings = rings.filter((each) => each.age < each.life);
    }

    // ---- what to draw (all in park coordinates) ----

    // Fish under the surface: drawn faint, before the water's sparkles.
    function beneath() {
      if (!active) return [];
      return fish.filter((one) => !one.leap).map((one) => {
        const turn = ((Math.round(one.angle / (TAU / 8)) % 8) + 8) % 8;
        const sprite = Sprites.fish[one.gold ? 'gold' : 'plain'][turn][Math.floor(one.wiggle * 4) % 2];
        return { sprite, x: Math.round(one.x) - (sprite.width >> 1), y: Math.round(one.y) - (sprite.height >> 1), alpha: one.gold ? 0.72 : 0.55 };
      });
    }

    // On the water: rings spreading from splashes and wakes, fading.
    function ripples() {
      if (!active) return [];
      return rings.map((each) => {
        const share = each.age / each.life;
        const sprite = Sprites.ripples[each.loud ? Math.min(2, Math.floor(share * 3)) : Math.min(1, Math.floor(share * 2))];
        return { sprite, x: Math.round(each.x) - (sprite.width >> 1), y: Math.round(each.y) - (sprite.height >> 1), alpha: (each.loud ? 0.9 : 0.55) * (1 - share) };
      });
    }

    // On the water, sorted by depth with the scenery: ducks floating, up-ended
    // or pattering along it, and a fish in mid-leap.
    function things() {
      if (!active) return [];
      const list = [];
      for (const duck of ducks) {
        if (duck.state === 'rise' || duck.state === 'arrive') continue;
        const art = Sprites.mallard[duck.drake ? 'drake' : 'hen'];
        const x = Math.round(duck.x);
        const y = Math.round(duck.y);
        if (duck.state === 'run' || duck.state === 'skid') {
          const sprite = art.flying[duck.facing][Math.floor(duck.flap * 12) % 2];
          list.push({ sprite, x: x - (sprite.width >> 1), y: y - 8, depth: duck.y });
        } else if (duck.dip > 0) {
          const sprite = art.upEnded[duck.facing];
          list.push({ sprite, x: x - (sprite.width >> 1), y: y - sprite.height + 1, depth: duck.y });
        } else {
          const sprite = art.floating[duck.facing];
          const bob = Math.sin(duck.bob) > 0.55 ? 1 : 0;
          list.push({ sprite, x: x - (sprite.width >> 1), y: y - sprite.height + 1 + bob, depth: duck.y });
        }
      }
      for (const one of fish) {
        if (!one.leap) continue;
        const share = Math.min(1, one.leap.t / TUNING.leap.time);
        const z = 4 * TUNING.leap.height * share * (1 - share);
        const sprite = Sprites.fishLeaping[one.gold ? 'gold' : 'plain'][one.leap.facing][share < 0.35 ? 0 : share < 0.65 ? 1 : 2];
        list.push({ sprite, x: Math.round(one.x) - (sprite.width >> 1), y: Math.round(one.y - z) - (sprite.height >> 1), depth: one.y });
      }
      return list;
    }

    // In the air, drawn over everything: ducks flying off or coming in.
    function flyers() {
      if (!active) return [];
      return ducks.filter((duck) => duck.state === 'rise' || duck.state === 'arrive').map((duck) => {
        const sprite = Sprites.mallard[duck.drake ? 'drake' : 'hen'].flying[duck.facing][Math.floor(duck.flap * 7) % 2];
        return { sprite, x: Math.round(duck.x) - (sprite.width >> 1), y: Math.round(duck.y - duck.z) - 6 };
      });
    }

    // Ducks in the air cast a shadow below them.
    function shadows() {
      if (!active) return [];
      return ducks.filter((duck) => (duck.state === 'rise' || duck.state === 'arrive') && duck.z > 3).map((duck) => ({ x: Math.round(duck.x), y: Math.round(duck.y) }));
    }

    // What can be heard, for the park's background sounds: ducks on the
    // water, coming in or flying off, and splashes. It only looks; nothing
    // here changes what any fish or duck does.
    function voices() {
      if (!active) return [];
      const list = [];
      for (const duck of ducks) {
        const kind = duck.state === 'arrive' ? 'duck-landing' : duck.state === 'rise' || duck.state === 'run' ? 'duck-flying' : 'duck';
        list.push({ who: duck, kind, x: duck.x, y: duck.y });
      }
      for (const each of rings) if (each.loud) list.push({ who: each, kind: 'splash', x: each.x, y: each.y });
      return list;
    }

    return {
      reset, update, beneath, ripples, things, flyers, shadows, voices,
      // For tests: the fish, the ducks, the rings, each pond's comings and goings, and what has happened.
      inspect: () => ({ fish, ducks, rings, waters, log, reaches, leapTimer }),
    };
  }

  return { create, TUNING };
})();
