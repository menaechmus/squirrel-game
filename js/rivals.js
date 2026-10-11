// The competition: a blue jay that swoops on acorns, a groundhog that pops up
// beside them, and grey squirrels that run for them. Each is a small state
// machine. The game hands in a `world` to act on:
//   level, player, acorns() -> list, take(acorn, who), random(), sound(name, at)

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
  };

  const HOLE_OFFSETS = [[-12, 3], [12, 3], [0, 9], [-10, -5], [10, -5]];
  const MAX_HOLES = 10;

  function create(world) {
    const { level, player } = world;
    const between = ([min, max]) => min + world.random() * (max - min);
    const near = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) < radius;

    let active = false;
    let jay = {};
    let hog = {};
    let squirrels = [];
    let holes = [];

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
          state: 'rest', timer: TUNING.squirrel.firstRest + i * 3, target: null,
          best: Infinity, stalled: 0, detour: 0, detourX: 0, detourY: 0, failures: 0,
          strollTo: null, strollTime: 0, pause: 1 + i,
        };
        level.pushOut(squirrel, 4);
        squirrels.push(squirrel);
      }
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
          holes.push({ x: hog.x, y: hog.y });
          if (holes.length > MAX_HOLES) holes.shift();
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

    function update(dt) {
      if (!active) return;
      updateJay(dt);
      updateHog(dt);
      for (const squirrel of squirrels) updateSquirrel(squirrel, dt);
    }

    // ---- what to draw (all in park coordinates) ----

    const hogIsUp = () => hog.state === 'rise' || hog.state === 'look' || hog.state === 'sink';

    // Flat on the ground, under everything else.
    function decals() {
      const list = holes.map((spot) => ({ sprite: Sprites.hole, x: spot.x - 8, y: spot.y - 3 }));
      if (active && hogIsUp()) list.push({ sprite: Sprites.hole, x: hog.x - 8, y: hog.y - 3 });
      return list;
    }

    function shadows() {
      if (!active) return [];
      const list = squirrels.map((squirrel) => ({ x: Math.round(squirrel.x), y: Math.round(squirrel.y) }));
      if (jay.state !== 'away') list.push({ x: Math.round(jay.x), y: Math.round(jay.y) });
      return list;
    }

    // Standing on the ground, sorted by depth with the scenery. `clip` draws only the top rows.
    function things(clock) {
      if (!active) return [];
      const list = squirrels.map((squirrel) => {
        const hop = squirrel.moving ? [0, 1, 2, 1][Math.floor(squirrel.hop * 12) % 4] : 0;
        return {
          sprite: Sprites.greySquirrel[squirrel.facing],
          x: Math.round(squirrel.x) - 8, y: Math.round(squirrel.y) - 15 - hop, depth: squirrel.y,
        };
      });
      if (hog.state === 'mound') {
        list.push({ sprite: Sprites.mound[Math.floor(clock * 8) % 2], x: hog.x - 8, y: hog.y - 4, depth: hog.y });
      } else if (hogIsUp()) {
        // The groundhog rises out of the hole; the hole's near rim is drawn over its base.
        const showing = Math.round(Math.max(0, hog.rise) * Sprites.groundhog.height);
        if (showing > 0) {
          list.push({ sprite: Sprites.groundhog, x: hog.x - 8, y: hog.y - showing, clip: showing, depth: hog.y });
          if (hog.carrying && showing > 3) {
            // Held up beside its cheek, so the prize is visible as it sinks.
            list.push({ sprite: Sprites.acorn, x: hog.x + 2, y: hog.y - showing + 3, clip: Math.min(Sprites.acorn.height, showing - 3), depth: hog.y + 0.05 });
          }
        }
        list.push({ sprite: Sprites.holeFront, x: hog.x - 8, y: hog.y, depth: hog.y + 0.1 });
      }
      return list;
    }

    // In the air, drawn over everything on the ground.
    function flyers() {
      if (!active || jay.state === 'away') return [];
      const x = Math.round(jay.x);
      const y = Math.round(jay.y - jay.z);
      const list = [{ sprite: Sprites.jay[jay.facing][Math.floor(jay.flap * 10) % 2], x: x - 8, y: y - 5 }];
      if (jay.carrying) list.push({ sprite: Sprites.acorn, x: x - 4, y: y + 3 });
      return list;
    }

    return {
      reset, update, decals, shadows, things, flyers,
      // For tests: a live view of each rival's state.
      inspect: () => ({ jay, hog, squirrels, holes }),
    };
  }

  return { create };
})();
