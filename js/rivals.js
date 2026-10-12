// The competition: a blue jay that swoops on acorns, a groundhog that pops up
// beside them, and grey squirrels that run for them. Each is a small state
// machine. There are also "extras", wildlife that is only for show: jays
// flying past and groundhogs popping up for a look round.
//
// The game hands in a `world` to act on:
//   level, player, acorns() -> list, take(acorn, who), random(), sound(name, at),
//   view() -> the part of the park on screen, as { x, y, w, h }

const Rivals = (() => {
  // Every number that decides how pushy the rivals are lives here.
  // Times are seconds, distances and speeds are game pixels.
  const TUNING = {
    keepClear: 45,          // thieves ignore acorns this close to the player
    jay: {
      firstVisit: 12,       // delay before the first one arrives
      gap: [20, 32],        // rest between visits
      hover: 1.6,           // warning time circling over the acorn
      scare: 34,            // it gives up if the player is this close at the swoop
      speed: 130,
      height: 46,
    },
    groundhog: {
      firstVisit: 22,
      gap: [24, 38],
      warn: 1.2,            // dirt heaves before it surfaces
      look: 0.6,            // time above ground before it grabs
      scare: 32,
    },
    squirrel: {
      count: 2,
      speed: 44,            // the player runs at 80
      strollSpeed: 22,
      firstRest: 8,
      rest: [16, 28],       // time spent ambling about between acorns
      reach: 9,
    },
    // Wildlife that never touches an acorn. It turns up where the player is looking.
    extras: {
      flyBy: {
        first: 4,
        gap: [5, 11],               // rest between flights
        flock: [1, 1, 1, 2, 2, 3],  // birds per flight, picked at random
        speed: [95, 135],
        height: [38, 62],
      },
      popUp: {
        first: 7,
        gap: [6, 13],
        atOnce: 2,                  // groundhogs above ground at the same time
        warn: 0.7,
        look: [1.2, 2.6],
        clearOfPlayer: 55,          // never surfaces this close to the player...
        duckWithin: 36,             // ...and ducks if the player walks up
        clearOfAcorns: 30,          // nor beside an acorn, where a thief would
      },
    },
  };

  const HOLE_OFFSETS = [[-12, 3], [12, 3], [0, 9], [-10, -5], [10, -5]];
  // Holes fill themselves in after a while, so the lawn doesn't end up pockmarked.
  const MAX_HOLES = 8;
  const HOLE_LIFE = 20;
  const HOLE_FILLING = 1.5;   // for its last moments a hole shows as a heap of loose dirt

  function create(world) {
    const { level, player } = world;
    const between = ([min, max]) => min + world.random() * (max - min);
    const near = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) < radius;

    let active = false;
    let jay = {};
    let hog = {};
    let squirrels = [];
    let holes = [];
    // The extras, and their own run of random numbers so that however many
    // turn up, the thieves behave exactly the same.
    let passers = [];
    let visitors = [];
    let extraRandom = Math.random;
    let flyByTimer = 0;
    let popUpTimer = 0;
    const pick = ([min, max]) => min + extraRandom() * (max - min);

    // An acorn nobody else is after, away from the player. A rival "claims" its
    // target so two of them never go for the same one.
    function pickTarget() {
      const free = world.acorns().filter((acorn) => !acorn.claimedBy && !near(acorn, player, TUNING.keepClear));
      return free.length ? free[Math.floor(world.random() * free.length)] : null;
    }

    function claim(rival, acorn) {
      rival.target = acorn;
      acorn.claimedBy = rival;
    }

    function release(rival) {
      if (rival.target && rival.target.claimedBy === rival) rival.target.claimedBy = null;
      rival.target = null;
    }

    function reset() {
      active = true;
      holes = [];
      passers = [];
      visitors = [];
      extraRandom = seededRandom(Math.floor(world.random() * 0x7fffffff));
      flyByTimer = TUNING.extras.flyBy.first;
      popUpTimer = TUNING.extras.popUp.first;
      jay = { state: 'away', timer: TUNING.jay.firstVisit, x: 0, y: 0, z: 0, facing: 'right', flap: 0, carrying: false, target: null };
      hog = { state: 'hidden', timer: TUNING.groundhog.firstVisit, x: 0, y: 0, rise: 0, carrying: false, target: null };
      // Grey squirrels start in opposite corners, well away from the player.
      const inset = level.border + 50;
      const corners = [{ x: inset, y: inset }, { x: level.size - inset, y: level.size - inset },
        { x: level.size - inset, y: inset }, { x: inset, y: level.size - inset }];
      squirrels = [];
      for (let i = 0; i < TUNING.squirrel.count; i++) {
        const squirrel = {
          x: corners[i % 4].x, y: corners[i % 4].y, facing: 'down', moving: false, hop: 0,
          idle: i * 1.3,   // staggered, so they don't sniff in step
          state: 'rest', timer: TUNING.squirrel.firstRest + i * 3, target: null,
          best: Infinity, stalled: 0, detour: 0, detourX: 0, detourY: 0, failures: 0,
          strollTo: null, strollTime: 0, pause: 1 + i,
        };
        level.pushOut(squirrel, 4);
        squirrels.push(squirrel);
      }
    }

    function digHole(spot) {
      holes.push({ x: spot.x, y: spot.y, age: 0 });
      while (holes.length > MAX_HOLES) holes.shift();
    }

    // ---- blue jay ----

    // Move a flyer towards a point; true once it gets there.
    function flyTowards(bird, x, y, step) {
      const dx = x - bird.x;
      const dy = y - bird.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) bird.facing = dx < 0 ? 'left' : 'right';
      if (distance <= step) {
        bird.x = x;
        bird.y = y;
        return true;
      }
      bird.x += (dx / distance) * step;
      bird.y += (dy / distance) * step;
      return false;
    }

    function jayLeaves() {
      release(jay);
      jay.state = 'leave';
      jay.exitX = jay.x + (jay.facing === 'left' ? -340 : 340);
      jay.exitY = jay.y - 90;
    }

    function updateJay(dt) {
      const tuning = TUNING.jay;
      jay.flap += dt;
      if (jay.state === 'away') {
        jay.timer -= dt;
        if (jay.timer > 0) return;
        const acorn = pickTarget();
        if (!acorn) {
          jay.timer = 2;
          return;
        }
        claim(jay, acorn);
        jay.side = world.random() < 0.5 ? -1 : 1;
        jay.x = acorn.x + jay.side * 300;
        jay.y = acorn.y - 60;
        jay.z = tuning.height;
        jay.carrying = false;
        jay.state = 'approach';
      } else if (jay.state === 'approach') {
        if (jay.target.gone) return jayLeaves();
        if (flyTowards(jay, jay.target.x + jay.side * 16, jay.target.y, tuning.speed * dt)) {
          jay.state = 'hover';
          jay.timer = tuning.hover;
          jay.angle = jay.side > 0 ? 0 : Math.PI;
          world.sound('chirp', jay);
        }
      } else if (jay.state === 'hover') {
        if (jay.target.gone) return jayLeaves();
        // Circle over the acorn, sinking lower: this is the player's warning.
        jay.timer -= dt;
        jay.angle += dt * 4.5;
        jay.x = jay.target.x + Math.cos(jay.angle) * 16;
        jay.y = jay.target.y + Math.sin(jay.angle) * 7;
        jay.facing = Math.sin(jay.angle) > 0 ? 'left' : 'right';
        jay.z = tuning.height * (0.6 + 0.4 * Math.max(0, jay.timer / tuning.hover));
        if (jay.timer <= 0) {
          jay.state = 'dive';
          jay.timer = 0.35;
          jay.from = { x: jay.x, y: jay.y, z: jay.z };
        }
      } else if (jay.state === 'dive') {
        if (jay.target.gone) return jayLeaves();
        jay.timer -= dt;
        const done = Math.min(1, 1 - jay.timer / 0.35);
        jay.x = jay.from.x + (jay.target.x - jay.from.x) * done;
        jay.y = jay.from.y + (jay.target.y - jay.from.y) * done;
        jay.z = jay.from.z + (5 - jay.from.z) * done;
        if (done >= 1) {
          if (near(player, jay.target, tuning.scare)) {
            world.sound('scared', jay);
          } else {
            world.take(jay.target, 'jays');
            jay.carrying = true;
          }
          jayLeaves();
        }
      } else if (jay.state === 'leave') {
        jay.z = Math.min(tuning.height + 14, jay.z + 70 * dt);
        if (flyTowards(jay, jay.exitX, jay.exitY, tuning.speed * 1.1 * dt)) {
          jay.state = 'away';
          jay.carrying = false;
          jay.timer = between(tuning.gap);
        }
      }
    }

    // ---- groundhog ----

    function updateHog(dt) {
      const tuning = TUNING.groundhog;
      if (hog.state === 'hidden') {
        hog.timer -= dt;
        if (hog.timer > 0) return;
        const acorn = pickTarget();
        const offset = acorn && HOLE_OFFSETS.find(([dx, dy]) => !level.blocked(acorn.x + dx, acorn.y + dy, 7));
        if (!offset) {
          hog.timer = 2;
          return;
        }
        claim(hog, acorn);
        hog.x = acorn.x + offset[0];
        hog.y = acorn.y + offset[1];
        hog.carrying = false;
        hog.state = 'mound';
        hog.timer = tuning.warn;
        world.sound('rumble', hog);
      } else if (hog.state === 'mound') {
        hog.timer -= dt;
        if (hog.target.gone) {
          // The acorn went while it was still digging: stay down.
          release(hog);
          hog.state = 'hidden';
          hog.timer = between(tuning.gap) / 2;
        } else if (hog.timer <= 0) {
          hog.state = 'rise';
          hog.rise = 0;
          world.sound('pop', hog);
        }
      } else if (hog.state === 'rise') {
        hog.rise = Math.min(1, hog.rise + dt / 0.22);
        if (hog.rise >= 1) {
          hog.state = 'look';
          hog.timer = tuning.look;
        }
      } else if (hog.state === 'look') {
        hog.timer -= dt;
        if (hog.timer > 0) return;
        if (!hog.target.gone) {
          if (near(player, hog.target, tuning.scare)) {
            world.sound('scared', hog);
          } else {
            world.take(hog.target, 'groundhogs');
            hog.carrying = true;
          }
        }
        release(hog);
        hog.state = 'sink';
      } else if (hog.state === 'sink') {
        hog.rise -= dt / 0.3;
        if (hog.rise <= 0) {
          digHole(hog);
          hog.state = 'hidden';
          hog.carrying = false;
          hog.timer = between(tuning.gap);
        }
      }
    }

    // ---- grey squirrels ----

    function rest(squirrel, seconds) {
      release(squirrel);
      squirrel.state = 'rest';
      squirrel.moving = false;
      squirrel.hop = 0;
      squirrel.timer = seconds;
      squirrel.strollTo = null;
      squirrel.pause = 0.5 + world.random();
    }

    function step(squirrel, stepX, stepY, speed, dt) {
      squirrel.x += stepX * speed * dt;
      squirrel.y += stepY * speed * dt;
      level.pushOut(squirrel, 4);
      squirrel.moving = true;
      squirrel.idle = 0;
      squirrel.hop += dt;
      if (Math.abs(stepX) > Math.abs(stepY)) squirrel.facing = stepX < 0 ? 'left' : 'right';
      else squirrel.facing = stepY < 0 ? 'up' : 'down';
    }

    // Between acorns a squirrel potters about: a short walk, a pause, another walk.
    function stroll(squirrel, dt) {
      if (squirrel.pause > 0) {
        squirrel.pause -= dt;
        squirrel.moving = false;
        squirrel.hop = 0;
        squirrel.idle += dt;
        return;
      }
      if (!squirrel.strollTo) {
        const angle = world.random() * Math.PI * 2;
        const distance = 30 + world.random() * 60;
        const spot = { x: squirrel.x + Math.cos(angle) * distance, y: squirrel.y + Math.sin(angle) * distance };
        if (!level.blocked(spot.x, spot.y, 6)) {
          squirrel.strollTo = spot;
          squirrel.strollTime = 0;
        }
        return;
      }
      const dx = squirrel.strollTo.x - squirrel.x;
      const dy = squirrel.strollTo.y - squirrel.y;
      const distance = Math.hypot(dx, dy);
      squirrel.strollTime += dt;
      if (distance < 3 || squirrel.strollTime > 5) {
        squirrel.strollTo = null;
        squirrel.pause = 0.6 + world.random() * 1.6;
        return;
      }
      step(squirrel, dx / distance, dy / distance, TUNING.squirrel.strollSpeed, dt);
    }

    function updateSquirrel(squirrel, dt) {
      const tuning = TUNING.squirrel;
      if (squirrel.state === 'rest') {
        squirrel.timer -= dt;
        if (squirrel.timer > 0) return stroll(squirrel, dt);
        let nearest = null;
        for (const acorn of world.acorns()) {
          if (acorn.claimedBy || acorn === squirrel.gaveUpOn) continue;
          if (!nearest || Math.hypot(acorn.x - squirrel.x, acorn.y - squirrel.y) < Math.hypot(nearest.x - squirrel.x, nearest.y - squirrel.y)) {
            nearest = acorn;
          }
        }
        squirrel.gaveUpOn = null;
        if (!nearest) {
          squirrel.timer = 1;
          return;
        }
        claim(squirrel, nearest);
        squirrel.state = 'run';
        squirrel.best = Infinity;
        squirrel.stalled = 0;
        squirrel.detour = 0;
        squirrel.failures = 0;
        return;
      }

      if (squirrel.target.gone) return rest(squirrel, between(tuning.rest) / 2);
      const dx = squirrel.target.x - squirrel.x;
      const dy = squirrel.target.y - 3 - squirrel.y;
      const distance = Math.hypot(dx, dy);
      if (distance < tuning.reach) {
        world.take(squirrel.target, 'squirrels');
        return rest(squirrel, between(tuning.rest));
      }

      // Run straight at the acorn. With no path-finding, a squirrel that stops
      // getting closer side-steps for a moment, and eventually tries another acorn.
      let stepX = dx / distance;
      let stepY = dy / distance;
      if (squirrel.detour > 0) {
        squirrel.detour -= dt;
        stepX = squirrel.detourX;
        stepY = squirrel.detourY;
        if (squirrel.detour <= 0) squirrel.best = Infinity;
      } else if (distance < squirrel.best - 1) {
        squirrel.best = distance;
        squirrel.stalled = 0;
      } else {
        squirrel.stalled += dt;
        if (squirrel.stalled > 0.6) {
          squirrel.failures++;
          if (squirrel.failures > 6) {
            squirrel.gaveUpOn = squirrel.target;
            return rest(squirrel, 1);
          }
          const side = world.random() < 0.5 ? -1 : 1;
          squirrel.detour = 0.5;
          squirrel.detourX = -stepY * side;
          squirrel.detourY = stepX * side;
          squirrel.stalled = 0;
        }
      }
      step(squirrel, stepX, stepY, tuning.speed, dt);
    }

    // ---- extras: only for show ----

    // One to three jays cross the part of the park the player is looking at.
    function launchFlock(view) {
      const tuning = TUNING.extras.flyBy;
      const heading = extraRandom() < 0.5 ? -1 : 1;   // -1 flies right to left
      const count = tuning.flock[Math.floor(extraRandom() * tuning.flock.length)];
      const speed = pick(tuning.speed);
      const height = pick(tuning.height);
      // A bird is drawn `height` above its spot on the ground, so aim the ground
      // track that much lower to bring the bird itself across the view.
      const startY = view.y + view.h * (0.12 + extraRandom() * 0.7) + height;
      const endY = startY + (extraRandom() - 0.5) * view.h * 0.5;
      for (let i = 0; i < count; i++) {
        // Followers trail behind and to one side, in a loose formation.
        const lag = i * (14 + extraRandom() * 10);
        const aside = i * (extraRandom() < 0.5 ? -9 : 9);
        passers.push({
          x: heading > 0 ? view.x - 30 - lag : view.x + view.w + 30 + lag,
          y: startY + aside,
          z: height + i * 3,
          toX: heading > 0 ? view.x + view.w + 40 : view.x - 40,
          toY: endY + aside,
          heading, speed,
          facing: heading > 0 ? 'right' : 'left',
          flap: extraRandom(),
          age: 0,
        });
      }
    }

    // Somewhere in view for a groundhog to surface: open ground, away from the
    // player, the acorns (that is where a thief comes up) and other holes.
    function popUpSpot(view) {
      const tuning = TUNING.extras.popUp;
      for (let attempt = 0; attempt < 12; attempt++) {
        const spot = {
          x: Math.round(view.x + 16 + extraRandom() * (view.w - 32)),
          y: Math.round(view.y + 30 + extraRandom() * (view.h - 44)),
        };
        if (level.blocked(spot.x, spot.y, 8) || near(player, spot, tuning.clearOfPlayer)) continue;
        if (world.acorns().some((acorn) => near(acorn, spot, tuning.clearOfAcorns))) continue;
        if (holes.some((other) => near(other, spot, 24)) || visitors.some((other) => near(other, spot, 40))) continue;
        if (hog.state !== 'hidden' && near(hog, spot, 40)) continue;
        if (squirrels.some((squirrel) => near(squirrel, spot, 24))) continue;
        return spot;
      }
      return null;
    }

    function updateExtras(dt) {
      const { flyBy, popUp } = TUNING.extras;
      const view = world.view();

      flyByTimer -= dt;
      if (flyByTimer <= 0) {
        launchFlock(view);
        flyByTimer = pick(flyBy.gap);
      }
      for (const bird of passers) {
        bird.flap += dt;
        bird.age += dt;
        if (!flyTowards(bird, bird.toX, bird.toY, bird.speed * dt)) continue;
        // Still in sight because the player ran alongside? Carry on rather than vanish.
        const inSight = bird.x > view.x - 24 && bird.x < view.x + view.w + 24
          && bird.y - bird.z > view.y - 24 && bird.y - bird.z < view.y + view.h + 24;
        if (inSight && bird.age < 40) bird.toX += bird.heading * 220;
        else bird.gone = true;
      }
      passers = passers.filter((bird) => !bird.gone);

      popUpTimer -= dt;
      if (popUpTimer <= 0) {
        popUpTimer = pick(popUp.gap);
        const spot = visitors.length < popUp.atOnce && popUpSpot(view);
        if (spot) visitors.push({ x: spot.x, y: spot.y, state: 'mound', timer: popUp.warn, rise: 0, looked: 0 });
      }
      for (const visitor of visitors) {
        const startled = near(player, visitor, popUp.duckWithin);
        if (visitor.state === 'mound') {
          visitor.timer -= dt;
          if (startled) visitor.gone = true;   // thinks better of it
          else if (visitor.timer <= 0) visitor.state = 'rise';
        } else if (visitor.state === 'rise') {
          visitor.rise = Math.min(1, visitor.rise + dt / 0.22);
          if (visitor.rise >= 1) {
            visitor.state = 'look';
            visitor.timer = pick(popUp.look);
          }
        } else if (visitor.state === 'look') {
          visitor.timer -= dt;
          visitor.looked += dt;
          if (visitor.timer <= 0 || startled) {
            visitor.state = 'sink';
            visitor.hurried = startled;
          }
        } else {
          visitor.rise -= dt / (visitor.hurried ? 0.14 : 0.3);
          if (visitor.rise <= 0) {
            digHole(visitor);
            visitor.gone = true;
          }
        }
      }
      visitors = visitors.filter((visitor) => !visitor.gone);
    }

    function update(dt) {
      if (!active) return;
      updateJay(dt);
      updateHog(dt);
      for (const squirrel of squirrels) updateSquirrel(squirrel, dt);
      updateExtras(dt);
      for (const hole of holes) hole.age += dt;
      holes = holes.filter((hole) => hole.age < HOLE_LIFE);
    }

    // ---- what to draw (all in park coordinates) ----

    const isUp = (groundhog) => groundhog.state === 'rise' || groundhog.state === 'look' || groundhog.state === 'sink';

    // Flat on the ground, under everything else.
    function decals() {
      if (!active) return [];
      const list = holes.map((hole) => (hole.age > HOLE_LIFE - HOLE_FILLING
        ? { sprite: Sprites.mound[0], x: hole.x - 8, y: hole.y - 4 }
        : { sprite: Sprites.hole, x: hole.x - 8, y: hole.y - 3 }));
      for (const groundhog of [hog, ...visitors]) {
        if (isUp(groundhog)) list.push({ sprite: Sprites.hole, x: groundhog.x - 8, y: groundhog.y - 3 });
      }
      return list;
    }

    function shadows() {
      if (!active) return [];
      const list = [...squirrels, ...passers].map((creature) => ({ x: Math.round(creature.x), y: Math.round(creature.y) }));
      if (jay.state !== 'away') list.push({ x: Math.round(jay.x), y: Math.round(jay.y) });
      return list;
    }

    // A groundhog at its hole, as depth-sorted pieces: heaving dirt before it
    // surfaces, then its body rising behind the hole's near rim.
    function groundhogPieces(list, groundhog, clock, body) {
      if (groundhog.state === 'mound') {
        list.push({ sprite: Sprites.mound[Math.floor(clock * 8) % 2], x: groundhog.x - 8, y: groundhog.y - 4, depth: groundhog.y });
      } else if (isUp(groundhog)) {
        const showing = Math.round(Math.max(0, groundhog.rise) * body.height);
        if (showing > 0) {
          list.push({ sprite: body, x: groundhog.x - 8, y: groundhog.y - showing, clip: showing, depth: groundhog.y });
          if (groundhog.carrying && showing > 3) {
            // Held up beside its cheek, so the prize is visible as it sinks.
            list.push({ sprite: Sprites.acorn, x: groundhog.x + 2, y: groundhog.y - showing + 3, clip: Math.min(Sprites.acorn.height, showing - 3), depth: groundhog.y + 0.05 });
          }
        }
        list.push({ sprite: Sprites.holeFront, x: groundhog.x - 8, y: groundhog.y, depth: groundhog.y + 0.1 });
      }
    }

    // Standing on the ground, sorted by depth with the scenery. `clip` draws only the top rows.
    function things(clock) {
      if (!active) return [];
      const list = squirrels.map((squirrel) => {
        const poses = Sprites.greySquirrel[squirrel.facing];
        const hop = squirrel.moving ? [0, 1, 2, 1][Math.floor(squirrel.hop * 12) % 4] : 0;
        return {
          sprite: squirrel.moving ? poses.rest : Sprites.idleFrame(poses, squirrel.idle),
          x: Math.round(squirrel.x) - 8, y: Math.round(squirrel.y) - 15 - hop, depth: squirrel.y,
        };
      });
      groundhogPieces(list, hog, clock, Sprites.groundhog);
      for (const visitor of visitors) {
        // A visitor glances from side to side while it is up.
        groundhogPieces(list, visitor, clock, Sprites.groundhogLooks[Math.floor(visitor.looked / 0.45) % 4]);
      }
      return list;
    }

    // In the air, drawn over everything on the ground.
    function flyers() {
      if (!active) return [];
      const list = passers.map((bird) => ({
        sprite: Sprites.jay[bird.facing][Math.floor(bird.flap * 10) % 2],
        x: Math.round(bird.x) - 8,
        y: Math.round(bird.y - bird.z + Math.sin(bird.flap * 3) * 1.5) - 5,
      }));
      if (jay.state !== 'away') {
        const x = Math.round(jay.x);
        const y = Math.round(jay.y - jay.z);
        list.push({ sprite: Sprites.jay[jay.facing][Math.floor(jay.flap * 10) % 2], x: x - 8, y: y - 5 });
        if (jay.carrying) list.push({ sprite: Sprites.acorn, x: x - 4, y: y + 3 });
      }
      return list;
    }

    return {
      reset, update, decals, shadows, things, flyers,
      // For tests: a live view of each creature's state.
      inspect: () => ({ jay, hog, squirrels, holes, passers, visitors }),
    };
  }

  return { create };
})();
