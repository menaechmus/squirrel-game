// The competition: a blue jay that swoops on acorns, a groundhog that digs up
// beside them and scurries out, and grey squirrels that run for them. Each is
// a small state machine. There are also "extras", wildlife that is only for
// show: jays flying past or landing for a while, and groundhogs popping up for
// a look round.
//
// The game hands in a `world` to act on:
//   level, player, acorns() -> list, take(acorn, who), random(), sound(name, at),
//   view() -> the part of the park on screen, as { x, y, w, h },
//   puff(spot) -> throw up a little dirt there,
//   wind(x, y) -> how hard the wind is pushing there, as Effects.lean gives it

const Rivals = (() => {
  // Every number that decides how pushy the rivals are lives here.
  // Times are seconds, distances and speeds are game pixels.
  const TUNING = {
    keepClear: 45,          // thieves ignore acorns this close to the player
    jay: {
      firstVisit: 8,        // delay before the first one arrives
      gap: [12, 20],        // rest between visits
      hover: 1.6,           // warning time circling over the acorn
      scare: 34,            // it gives up if the player is this close at the swoop
      speed: 130,
      height: 46,
      inSight: 0.9,         // how often it picks an acorn the player can see, when there is one...
      standOff: 60,         // ...though never one this close to the player
      lead: 3.2,            // seconds ahead it reckons the player will be by the time it swoops
    },
    groundhog: {
      firstVisit: 18,
      gap: [19, 30],
      warn: 1.2,            // dirt heaves before it surfaces
      look: 1.1,            // eyes just out, glancing about, before it climbs out
      scare: 32,            // it gives up if the player is this close to the acorn, or to it
      walk: 26,             // its waddle out to the acorn and home again...
      bolt: 70,             // ...and its dash home after a fright
      reach: 10,            // it picks an acorn up this far ahead of its feet
      inSight: 0.9,         // like the jay, it mostly picks an acorn the player can see...
      standOff: 60,         // ...though never one this close to the player
      lead: 2.5,            // seconds ahead it reckons the player will be by the time it climbs out
      secondThoughts: 2,    // times it will stay down and dig up elsewhere, if the player has moved on before it surfaces
    },
    squirrel: {
      count: 3,
      speed: 44,            // the player runs at 80
      strollSpeed: 22,
      firstRest: 8,
      rest: [19, 32],       // time spent ambling about between acorns
      reach: 9,
    },
    // Wildlife that never touches an acorn. It turns up where the player is looking.
    extras: {
      flyBy: {
        first: 4,
        gap: [4, 9],                // rest between flights
        flock: [1, 1, 1, 2, 2, 3],  // birds per flight, picked at random
        speed: [95, 135],
        height: [38, 62],
      },
      // Jays that come down to sit for a while, on open grass or a tree top.
      perch: {
        first: 6,
        gap: [8, 15],               // rest between new arrivals
        atOnce: 4,                  // jays sitting at the same time
        stay: [4, 9],               // seconds one sits on the grass...
        stayOnTree: [8, 18],        // ...and up a tree
        turn: [1.2, 3.5],           // seconds between hops round to face the other way
        onTree: 0.5,                // how often it picks a tree top, when one is in view
        lead: 1.2,                  // how many seconds ahead of the player to aim...
        farEnd: 0.35,               // ...and how much of that view to use, at its far end, when they are on the move...
        treeFarEnd: 0.7,            // ...or when it looks for a tree top, which is harder to find
        speed: [95, 125],
        height: 40,                 // how far above its perch it flies in and out
        glide: 70,                  // it starts coming down this far from the perch
        clearOfPlayer: 48,          // never lands this close to the player...
        flushWithin: 30,            // ...and one on the grass takes off if the player walks up
        clearOfAcorns: 30,          // nor beside an acorn, where a thief would be
      },
      popUp: {
        first: 3,
        gap: [3.5, 7],              // rest between new arrivals
        hurry: 0.7,                 // ...times this while the player is on the move and leaving them behind
        atOnce: 3,                  // groundhogs out at the same time
        warn: 0.4,                  // dirt heaves before one surfaces
        look: [2, 4],               // seconds above ground each time
        encores: [0, 1, 1, 2],      // how many more times it pops out of the same hole, picked at random
        under: [0.8, 2],            // seconds below ground between those
        peekShare: 0.5,             // how often only the top of its head comes out
        nearShare: 0.75,            // how often it picks a spot close to where the player is heading
        lead: 1.3,                  // how many seconds ahead of the player to aim
        reach: 115,                 // "close" means within this far of that point
        clearOfPlayer: 40,          // never surfaces this close to the player...
        duckWithin: 26,             // ...and ducks if the player walks up
        clearOfAcorns: 40,          // nor near an acorn: the thief digs up about 20 from one, and must not be mistaken
      },
    },
  };

  // Where the thieving groundhog digs up: to one side of its acorn, a short
  // scurry away, so it never goes more than a tile from its hole.
  const HOLE_OFFSETS = [[-22, -2], [22, -2], [-21, -8], [21, -8], [-20, 5], [20, 5]];
  const DOORSTEP = 3;         // it climbs out onto the near rim of its hole, this far down the screen
  // Holes fill themselves in after a while, so the lawn doesn't end up pockmarked.
  const MAX_HOLES = 8;
  const HOLE_LIFE = 20;
  const HOLE_FILLING = 1.5;   // for its last moments a hole shows as a heap of loose dirt
  const PEEK = 0.6;           // how far out a peeking groundhog comes: ears, eyes and nose
  const JOY_HEIGHT = { squirrel: 4, groundhog: 3 };   // pixels each jumps for joy on getting an acorn
  const MAX_DRIFT = 120;      // ignore the player "moving" faster than this (a restart, not a run)
  // A sitting jay this close to the edge of the view (sides, top, bottom) is about to be left behind.
  const PERCH_EDGE = { side: 28, top: 34, bottom: 16 };
  // What a sitting jay does with its head, a beat at a time.
  const JAY_LOOKS = ['rest', 'turned', 'rest', 'up'];

  function create(world) {
    const { level, player } = world;
    const between = ([min, max]) => min + world.random() * (max - min);
    const near = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) < radius;
    // Is an acorn, or a spot beside one, on screen: clear of the edges and of the score bar?
    const onScreen = (spot, view) => spot.x > view.x + 12 && spot.x < view.x + view.w - 12
      && spot.y > view.y + 26 && spot.y < view.y + view.h - 8;
    // Is a spot well outside a rectangle of the park (the view, say)?
    const outside = (spot, rect) => spot.x < rect.x - 24 || spot.x > rect.x + rect.w + 24
      || spot.y < rect.y - 24 || spot.y > rect.y + rect.h + 24;

    // Tree tops are drawn over whatever is behind them. Would one hide a creature
    // standing here? (`depth` is where the creature sorts, if not where it stands.)
    const canopies = level.props.filter((prop) => Scenery.props[prop.sprite].hides).map((prop) => {
      const sprite = Scenery.props[prop.sprite].frames[0];
      return { x: prop.x, y: prop.y, half: sprite.width / 2, height: sprite.height };
    });
    const underTreeTop = (x, y, depth = y) => canopies.some((tree) => tree.y > depth
      && y < tree.y && y > tree.y - tree.height - 4 && Math.abs(x - tree.x) < tree.half + 6);

    // Tree tops a jay can sit on: where its feet go (x, and z above the tree's
    // base at y) when there is no wind. One hidden by a nearer tree is left out.
    const treeTops = [];
    for (const prop of level.props) {
      const art = Scenery.props[prop.sprite];
      if (!art.tops) continue;
      const top = art.tops[art.rest];
      const perch = { tree: prop, art, x: prop.x + top.x, y: prop.y, z: top.y - 2 };
      if (!underTreeTop(perch.x, perch.y - perch.z, prop.y)) treeTops.push(perch);
    }

    let active = false;
    let jay = {};
    let hog = {};
    let squirrels = [];
    let holes = [];
    // The extras, and their own run of random numbers so that however many
    // turn up, the thieves behave exactly the same.
    let passers = [];
    let perchers = [];
    let visitors = [];
    let extraRandom = Math.random;
    let flyByTimer = 0;
    let perchTimer = 0;
    let popUpTimer = 0;
    const pick = ([min, max]) => min + extraRandom() * (max - min);
    // Which way the player is heading (a smoothed velocity, pixels a second), so
    // a groundhog can surface where they are about to be looking.
    let drift = { x: 0, y: 0 };
    // The same over the last few seconds: next to nothing for a player darting
    // from acorn to acorn, their full speed for one striding across the park.
    // The groundhog, which takes its time, goes by this.
    let trend = { x: 0, y: 0 };
    let lastSpot = { x: player.x, y: player.y };

    // An acorn nobody else is after, away from the player. A rival "claims" its
    // target so two of them never go for the same one. `usable` can rule acorns out.
    function pickTarget(usable = () => true) {
      const free = world.acorns().filter((acorn) => !acorn.claimedBy && !near(acorn, player, TUNING.keepClear) && usable(acorn));
      return free.length ? free[Math.floor(world.random() * free.length)] : null;
    }

    // The jay and the groundhog like an audience. Mostly they go for an acorn
    // that will be on screen when they strike (though not one right beside the
    // player), so their thefts can be seen and fought off instead of all
    // happening out of sight. `tuning` is the thief's own block of numbers and
    // `heading` its idea of where the player is going; `usable` can rule acorns out.
    function pickSeenTarget(tuning, lead, heading = drift, usable = () => true) {
      if (world.random() < tuning.inSight) {
        // Where the player, and so the screen, should be by the time it strikes, `lead` seconds on.
        const soon = comingView(world.view(), lead, heading);
        const there = { x: player.x + heading.x * lead, y: player.y + heading.y * lead };
        const open = world.acorns().filter((acorn) => !acorn.claimedBy
          && !near(acorn, player, tuning.standOff) && !near(acorn, there, tuning.standOff)
          && onScreen(acorn, soon) && usable(acorn));
        if (open.length) {
          // One of the few nearest that spot, so it happens in plain view.
          const reach = (acorn) => Math.hypot(acorn.x - there.x, acorn.y - there.y);
          open.sort((a, b) => reach(a) - reach(b));
          return open[Math.floor(world.random() * Math.min(3, open.length))];
        }
      }
      return pickTarget(usable);
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
      perchers = [];
      visitors = [];
      extraRandom = seededRandom(Math.floor(world.random() * 0x7fffffff));
      flyByTimer = TUNING.extras.flyBy.first;
      perchTimer = TUNING.extras.perch.first;
      popUpTimer = TUNING.extras.popUp.first;
      drift = { x: 0, y: 0 };
      trend = { x: 0, y: 0 };
      lastSpot = { x: player.x, y: player.y };
      jay = { state: 'away', timer: TUNING.jay.firstVisit, x: 0, y: 0, z: 0, facing: 'right', flap: 0, carrying: false, target: null };
      // The groundhog is at (x, y); `home` is its hole, which it only leaves to fetch an acorn.
      hog = {
        state: 'hidden', timer: TUNING.groundhog.firstVisit, x: 0, y: 0, home: { x: 0, y: 0 }, rise: 0,
        facing: 'right', step: 0, looked: 0, tries: 0, joy: 0, hurried: false, carrying: false, target: null,
      };
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
          strollTo: null, strollTime: 0, pause: 1 + i, joy: 0,
        };
        level.pushOut(squirrel, 4);
        squirrels.push(squirrel);
      }
    }

    function digHole(spot) {
      holes.push({ x: spot.x, y: spot.y, age: 0 });
      while (holes.length > MAX_HOLES) holes.shift();
    }

    // Move a creature that faces left or right towards a point; true once it gets there.
    function moveTowards(creature, x, y, step) {
      const dx = x - creature.x;
      const dy = y - creature.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) creature.facing = dx < 0 ? 'left' : 'right';
      if (distance <= step) {
        creature.x = x;
        creature.y = y;
        return true;
      }
      creature.x += (dx / distance) * step;
      creature.y += (dy / distance) * step;
      return false;
    }

    // ---- blue jay ----

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
        const acorn = pickSeenTarget(tuning, tuning.lead);
        if (!acorn) {
          jay.timer = 2;
          return;
        }
        claim(jay, acorn);
        jay.changedMind = false;
        jay.side = world.random() < 0.5 ? -1 : 1;
        // It flies in from just off screen on one side: seen arriving, but not long about it.
        const view = world.view();
        const toEdge = jay.side > 0 ? view.x + view.w + 24 - acorn.x : acorn.x - (view.x - 24);
        jay.x = acorn.x + jay.side * Math.max(140, Math.min(300, toEdge));
        jay.y = acorn.y - 60;
        jay.z = tuning.height;
        jay.carrying = false;
        jay.state = 'approach';
      } else if (jay.state === 'approach') {
        if (jay.target.gone) return jayLeaves();
        if (moveTowards(jay, jay.target.x + jay.side * 16, jay.target.y, tuning.speed * dt)) {
          // If the player has wandered off in the meantime, it tries once for an
          // acorn they can see now, and flies on to that instead.
          const view = world.view();
          if (!jay.changedMind && !onScreen(jay.target, view)) {
            jay.changedMind = true;
            const better = pickSeenTarget(tuning, tuning.hover);
            if (better && onScreen(better, view)) {
              release(jay);
              claim(jay, better);
              return;
            }
          }
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
        if (moveTowards(jay, jay.exitX, jay.exitY, tuning.speed * 1.1 * dt)) {
          jay.state = 'away';
          jay.carrying = false;
          jay.timer = between(tuning.gap);
        }
      }
    }

    // ---- groundhog ----

    // Places beside an acorn where the groundhog could dig up in plain sight:
    // open ground, with a clear run from `door`, where it steps out, to `grab`,
    // where it picks the acorn up.
    function holeSpots(acorn) {
      const clear = (x, y, radius) => !level.blocked(x, y, radius) && !underTreeTop(x, y);
      return HOLE_OFFSETS
        .map(([dx, dy]) => ({
          x: acorn.x + dx, y: acorn.y + dy,
          door: { x: acorn.x + dx, y: acorn.y + dy + DOORSTEP },
          grab: { x: acorn.x + Math.sign(dx) * TUNING.groundhog.reach, y: acorn.y + 1 },
        }))
        .filter((hole) => clear(hole.x, hole.y, 7) && [0, 0.25, 0.5, 0.75, 1].every((part) =>
          clear(hole.door.x + (hole.grab.x - hole.door.x) * part, hole.door.y + (hole.grab.y - hole.door.y) * part, 4)));
    }

    // It gives up on its acorn, because the player frightened it or because the
    // acorn has gone, and makes for `next`.
    function hogGivesUp(next) {
      hog.hurried = !hog.target.gone;
      if (hog.hurried) world.sound('scared', hog);
      release(hog);
      hog.state = next;
      hog.timer = 0;
    }

    function updateHog(dt) {
      const tuning = TUNING.groundhog;
      hog.joy = Math.max(0, hog.joy - dt);
      const playerClose = () => near(player, hog.target, tuning.scare) || near(player, hog, tuning.scare);
      if (hog.state === 'hidden') {
        hog.timer -= dt;
        if (hog.timer > 0) return;
        const acorn = pickSeenTarget(tuning, tuning.lead, trend, (candidate) => holeSpots(candidate).length > 0);
        if (!acorn) {
          hog.timer = 2;
          return;
        }
        // Of the places it could dig up, one the player should see, if there is one.
        const view = comingView(world.view(), tuning.lead, trend);
        const spots = holeSpots(acorn);
        const seen = spots.filter((spot) => onScreen(spot, view));
        const from = seen.length ? seen : spots;
        claim(hog, acorn);
        hog.home = from[Math.floor(world.random() * from.length)];
        hog.x = hog.home.x;
        hog.y = hog.home.y;
        hog.facing = acorn.x < hog.x ? 'left' : 'right';
        hog.carrying = false;
        hog.hurried = false;
        hog.state = 'mound';
        hog.timer = tuning.warn;
        hog.rumbled = false;
      } else if (hog.state === 'mound') {
        hog.timer -= dt;
        const view = world.view();
        // Its rumble goes with dirt the player can see heaving. Out of sight it
        // keeps quiet while it may yet think again, so nothing is heard that comes to nothing.
        if (!hog.rumbled && (hog.tries >= tuning.secondThoughts || onScreen(hog.home, view))) {
          hog.rumbled = true;
          world.sound('rumble', hog);
        }
        if (hog.target.gone) {
          // The acorn went while it was still digging: stay down.
          release(hog);
          hog.state = 'hidden';
          hog.timer = between(tuning.gap) / 2;
          hog.tries = 0;
        } else if (hog.timer <= 0) {
          const unseen = !onScreen(hog.home, view) && !onScreen(hog.home, comingView(view, tuning.look));
          if (unseen && hog.tries < tuning.secondThoughts) {
            // The player has moved on and would not see it come up or look about:
            // it stays down and digs somewhere else. (The jay changes its mind the same way.)
            hog.tries++;
            release(hog);
            hog.state = 'hidden';
            hog.timer = 0.5;
          } else {
            hog.state = 'rise';
            hog.rise = 0;
            hog.looked = 0;
            world.sound('pop', hog);
          }
        }
      } else if (hog.state === 'rise') {
        // Only as far as its eyes, to see whether the coast is clear.
        hog.rise = Math.min(PEEK, hog.rise + dt / 0.22);
        if (hog.rise >= PEEK) {
          hog.state = 'look';
          hog.timer = tuning.look;
        }
      } else if (hog.state === 'look') {
        hog.timer -= dt;
        hog.looked += dt;
        if (hog.target.gone || playerClose()) hogGivesUp('sink');
        else if (hog.timer <= 0) hog.state = 'climb';
      } else if (hog.state === 'climb') {
        hog.rise = Math.min(1, hog.rise + dt / 0.22);
        if (hog.rise >= 1) {
          hog.state = 'fetch';
          hog.step = 0;
          hog.y = hog.home.door.y;
        }
      } else if (hog.state === 'fetch') {
        // Out of its hole and across to the acorn; this is the player's last chance.
        if (hog.target.gone || playerClose()) return hogGivesUp('back');
        hog.step += dt;
        if (moveTowards(hog, hog.home.grab.x, hog.home.grab.y, tuning.walk * dt)) {
          const acorn = hog.target;
          hog.carrying = true;
          release(hog);
          hog.state = 'back';
          // It jumps for joy with its prize, on the spot, before it turns for home.
          hog.joy = Sprites.cheer(0);
          hog.timer = hog.joy;
          // Last of all: taking the final acorn ends the round, and the game may start another at once.
          world.take(acorn, 'groundhogs');
        }
      } else if (hog.state === 'back') {
        hog.timer -= dt;
        if (hog.timer > 0) return;
        hog.step += dt * (hog.hurried ? 2 : 1);
        if (moveTowards(hog, hog.home.door.x, hog.home.door.y, (hog.hurried ? tuning.bolt : tuning.walk) * dt)) {
          hog.state = 'sink';
          hog.rise = 1;
          hog.y = hog.home.y;
        }
      } else if (hog.state === 'sink') {
        hog.rise -= dt / (hog.hurried ? 0.14 : 0.3);
        if (hog.rise <= 0) {
          digHole(hog.home);
          hog.state = 'hidden';
          hog.carrying = false;
          hog.timer = between(tuning.gap);
          hog.tries = 0;
        }
      }
    }

    // ---- grey squirrels ----

    // Where a squirrel stands to pick an acorn up.
    const pickupSpot = (acorn) => ({ x: acorn.x, y: acorn.y - 3 });

    function rest(squirrel, seconds) {
      release(squirrel);
      squirrel.state = 'rest';
      squirrel.moving = false;
      squirrel.hop = 0;
      squirrel.timer = seconds;
      squirrel.strollTo = null;
      squirrel.pause = Math.max(0.5 + world.random(), squirrel.joy);
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
        if (!level.blocked(spot.x, spot.y, 6) && level.clearLine(squirrel, spot)) {
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
      squirrel.joy = Math.max(0, squirrel.joy - dt);
      if (squirrel.state === 'rest') {
        squirrel.timer -= dt;
        if (squirrel.timer > 0) return stroll(squirrel, dt);
        // The acorn nearest by the way it would have to go: round ponds, the
        // mountain and logs, over a bridge if it is across the stream.
        const free = world.acorns().filter((acorn) => !acorn.claimedBy && acorn !== squirrel.gaveUpOn);
        const found = free.length ? level.nearestByWay(squirrel, free.map(pickupSpot)) : null;
        squirrel.gaveUpOn = null;
        if (!found) {
          squirrel.timer = 1;
          return;
        }
        const nearest = free[found.index];
        claim(squirrel, nearest);
        squirrel.state = 'run';
        squirrel.way = found.way;
        squirrel.leg = 0;
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
        squirrel.joy = Sprites.cheer(squirrel.joy);
        world.take(squirrel.target, 'squirrels');
        return rest(squirrel, between(tuning.rest));
      }

      // Run along its way, waypoint by waypoint. If it stops getting closer it
      // side-steps for a moment, works out its way again, and in the end tries
      // another acorn.
      let goal = squirrel.way[squirrel.leg];
      if (squirrel.leg < squirrel.way.length - 1 && Math.hypot(goal.x - squirrel.x, goal.y - squirrel.y) < 5) {
        squirrel.leg++;
        squirrel.best = Infinity;
        goal = squirrel.way[squirrel.leg];
      }
      const toGoal = Math.hypot(goal.x - squirrel.x, goal.y - squirrel.y) || 0.01;
      let stepX = (goal.x - squirrel.x) / toGoal;
      let stepY = (goal.y - squirrel.y) / toGoal;
      if (squirrel.detour > 0) {
        squirrel.detour -= dt;
        stepX = squirrel.detourX;
        stepY = squirrel.detourY;
        if (squirrel.detour <= 0) squirrel.best = Infinity;
      } else if (toGoal < squirrel.best - 1) {
        squirrel.best = toGoal;
        squirrel.stalled = 0;
      } else {
        squirrel.stalled += dt;
        if (squirrel.stalled > 0.6) {
          squirrel.failures++;
          if (squirrel.failures > 6) {
            squirrel.gaveUpOn = squirrel.target;
            return rest(squirrel, 1);
          }
          if (squirrel.failures === 3) {
            squirrel.way = level.wayTo(squirrel, pickupSpot(squirrel.target)) || [pickupSpot(squirrel.target)];
            squirrel.leg = 0;
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

    // The part of the park that will be on screen `lead` seconds from now, given
    // where the player is heading: the view slid along, but not past the hedge.
    function comingView(view, lead, heading = drift) {
      const slide = (from, by, span) => (span >= level.size ? from : Math.min(level.size - span, Math.max(0, from + by)));
      return { x: slide(view.x, heading.x * lead, view.w), y: slide(view.y, heading.y * lead, view.h), w: view.w, h: view.h };
    }

    // Is a bird in the air where the player can see it, or nearly?
    const inSight = (bird, view) => !outside({ x: bird.x, y: bird.y - bird.z }, view);

    // A place on the ground for wildlife that is only for show: in `soon`, the
    // part of the park coming into view; in the open, not under a tree top; and
    // away from the player, the acorns (that is where a thief turns up) and
    // everybody else. `tuning` says how far from the player and the acorns.
    function quietSpot(spot, soon, tuning) {
      if (spot.x < soon.x + 12 || spot.x > soon.x + soon.w - 12 || spot.y < soon.y + 26 || spot.y > soon.y + soon.h - 10) return false;
      if (level.blocked(spot.x, spot.y, 8) || underTreeTop(spot.x, spot.y) || near(player, spot, tuning.clearOfPlayer)) return false;
      if (world.acorns().some((acorn) => near(acorn, spot, tuning.clearOfAcorns))) return false;
      if (holes.some((other) => near(other, spot, 24)) || visitors.some((other) => near(other, spot, 40))) return false;
      if (hog.state !== 'hidden' && near(hog.home, spot, 40)) return false;
      if (squirrels.some((squirrel) => near(squirrel, spot, 24))) return false;
      return !perchers.some((bird) => near(bird.spot, spot, 30));
    }

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

    function updateFlyBys(dt, view) {
      flyByTimer -= dt;
      if (flyByTimer <= 0) {
        launchFlock(view);
        flyByTimer = pick(TUNING.extras.flyBy.gap);
      }
      for (const bird of passers) {
        bird.flap += dt;
        bird.age += dt;
        if (!moveTowards(bird, bird.toX, bird.toY, bird.speed * dt)) continue;
        // Still in sight because the player ran alongside? Carry on rather than vanish.
        if (inSight(bird, view) && bird.age < 40) bird.toX += bird.heading * 220;
        else bird.gone = true;
      }
      passers = passers.filter((bird) => !bird.gone);
    }

    // Where a jay sits: its spot on the grass, or the top of its tree, which
    // sways in the wind. Its feet are `z` above (x, y).
    function seatOf(spot) {
      if (!spot.tree) return spot;
      const top = Scenery.top(spot.art, world.wind(spot.tree.x, spot.tree.y));
      return { x: spot.tree.x + top.x, y: spot.tree.y, z: top.y - 2 };
    }

    // Is a perch out at the edge of a view, or beyond it? (`feet` is where the bird's feet are.)
    const atEdge = (feet, rect) => feet.x < rect.x + PERCH_EDGE.side || feet.x > rect.x + rect.w - PERCH_EDGE.side
      || feet.y < rect.y + PERCH_EDGE.top || feet.y > rect.y + rect.h - PERCH_EDGE.bottom;

    // Somewhere for a jay to sit, in parts of `soon`: a tree top in `treeZone`, or open grass in `zone`.
    function perchSpot(zone, treeZone, soon) {
      const tuning = TUNING.extras.perch;
      const inTreeZone = (feet) => feet.x > treeZone.x && feet.x < treeZone.x + treeZone.w && feet.y > treeZone.y && feet.y < treeZone.y + treeZone.h;
      if (extraRandom() < tuning.onTree) {
        const free = treeTops.filter((top) => {
          const feet = { x: top.x, y: top.y - top.z };
          return inTreeZone(feet) && !world.acorns().some((acorn) => near(acorn, feet, tuning.clearOfAcorns))
            && !perchers.some((bird) => bird.spot === top);
        });
        if (free.length) return free[Math.floor(extraRandom() * free.length)];
      }
      for (let attempt = 0; attempt < 12; attempt++) {
        const spot = { x: Math.round(zone.x + extraRandom() * zone.w), y: Math.round(zone.y + extraRandom() * zone.h), z: 0, tree: null };
        if (quietSpot(spot, soon, tuning)) return spot;
      }
      return null;
    }

    // A jay sets off for somewhere to sit. With the player standing still that
    // is anywhere well inside the view, and it flies in from the nearer side.
    // With the player on the move it is the far end of what is coming into view
    // (more of it for a tree top), and it flies in from ahead: they see it land,
    // and walk towards it.
    function landJay(view) {
      const tuning = TUNING.extras.perch;
      const soon = comingView(view, tuning.lead);
      const across = Math.abs(drift.x) > 15;
      const zoneFor = (share) => {
        const zone = {
          x: soon.x + PERCH_EDGE.side + 6, y: soon.y + PERCH_EDGE.top + 6,
          w: soon.w - 2 * PERCH_EDGE.side - 12, h: soon.h - PERCH_EDGE.top - PERCH_EDGE.bottom - 12,
        };
        if (across) {
          const far = zone.w * share;
          if (drift.x > 0) zone.x += zone.w - far;
          zone.w = far;
        }
        if (Math.abs(drift.y) > 15) {
          const far = zone.h * share;
          if (drift.y > 0) zone.y += zone.h - far;
          zone.h = far;
        }
        return zone;
      };
      const spot = perchSpot(zoneFor(tuning.farEnd), zoneFor(tuning.treeFarEnd), soon);
      if (!spot) return;
      const seat = seatOf(spot);
      const nearerSide = (seat.x - soon.x < soon.w / 2) === (extraRandom() < 0.75);
      const fromLeft = across ? drift.x < 0 : nearerSide;
      perchers.push({
        state: 'arrive', spot,
        // Off screen now, and off what will be the screen.
        x: fromLeft ? Math.min(view.x, soon.x) - 30 : Math.max(view.x, soon.x) + view.w + 30,
        y: seat.y + (extraRandom() - 0.5) * 50,
        z: seat.z + 5 + tuning.height,
        speed: pick(tuning.speed),
        facing: fromLeft ? 'right' : 'left',
        flap: extraRandom(),
        beat: 0.45 + extraRandom() * 0.35,   // seconds it holds each look
        timer: 0, turn: 0, looked: 0, age: 0,
      });
    }

    // Up and away: from whatever startled it, or else across the view, where it can be watched going.
    function takeOff(bird, view, startled) {
      const heading = (startled ? player.x < bird.x : bird.x < view.x + view.w / 2) ? 1 : -1;
      if (bird.state === 'sit') bird.z += 5;
      bird.state = 'leave';
      bird.age = 0;
      bird.toX = bird.x + heading * 600;
      bird.toY = bird.y - 100 - extraRandom() * 120;
      bird.speed *= startled ? 1.5 : 1.2;
    }

    // Now and then a jay comes down, sits looking about, and flies off again.
    function updatePerchers(dt, view) {
      const tuning = TUNING.extras.perch;
      perchTimer -= dt;
      if (perchTimer <= 0) {
        perchTimer = pick(tuning.gap);
        if (perchers.filter((bird) => bird.state !== 'leave').length < tuning.atOnce) landJay(view);
      }
      const soon = comingView(view, tuning.lead);
      for (const bird of perchers) {
        bird.flap += dt;
        if (bird.state === 'leave') {
          bird.age += dt;
          bird.z = Math.min(bird.spot.z + 5 + tuning.height, bird.z + 60 * dt);
          moveTowards(bird, bird.toX, bird.toY, bird.speed * dt);
          if (!inSight(bird, view) || bird.age > 20) bird.gone = true;
          continue;
        }
        const seat = seatOf(bird.spot);
        const feet = { x: seat.x, y: seat.y - seat.z };
        // A perch that is suddenly nowhere near the screen (a new round, say) is simply forgotten.
        if (outside(feet, view) && outside(feet, soon)) {
          bird.gone = true;
          continue;
        }
        // On the grass it will not stay near the player, a running squirrel or a groundhog digging up.
        const startled = !bird.spot.tree && (near(player, seat, tuning.flushWithin)
          || squirrels.some((squirrel) => near(squirrel, seat, 14)) || (hog.state !== 'hidden' && near(hog.home, seat, 26)));
        // Out at the edge of the screen with the player heading away, it is time
        // to go: up and off while they can still see it.
        if (startled || (atEdge(feet, view) && atEdge(feet, soon))) {
          takeOff(bird, view, startled);
          continue;
        }
        if (bird.state === 'arrive') {
          // It glides down over the last stretch, slowing, to end just over its perch.
          const left = Math.min(1, Math.hypot(seat.x - bird.x, seat.y - bird.y) / tuning.glide);
          bird.z = seat.z + 5 + tuning.height * left;
          if (moveTowards(bird, seat.x, seat.y, bird.speed * (0.5 + 0.5 * left) * dt)) {
            bird.state = 'sit';
            bird.timer = pick(bird.spot.tree ? tuning.stayOnTree : tuning.stay);
            bird.turn = pick(tuning.turn);
          }
        } else {
          // Sitting: a tree top carries it to and fro; now and then it hops round to face the other way.
          bird.x = seat.x;
          bird.y = seat.y;
          bird.z = seat.z;
          bird.timer -= dt;
          bird.looked += dt;
          bird.turn -= dt;
          if (bird.turn <= 0) {
            bird.facing = bird.facing === 'left' ? 'right' : 'left';
            bird.turn = pick(tuning.turn);
          }
          if (bird.timer <= 0) takeOff(bird, view, false);
        }
      }
      perchers = perchers.filter((bird) => !bird.gone);
    }

    // Somewhere for a groundhog to surface where the player will see it: open
    // ground, usually a short run from where they are heading.
    function popUpSpot(view) {
      const tuning = TUNING.extras.popUp;
      const ahead = { x: player.x + drift.x * tuning.lead, y: player.y + drift.y * tuning.lead };
      const soon = comingView(view, tuning.lead);
      const speed = Math.hypot(drift.x, drift.y);
      for (let attempt = 0; attempt < 16; attempt++) {
        let spot;
        if (extraRandom() < tuning.nearShare) {
          // Anywhere round a player who is standing still; in front of one on the move.
          const angle = speed > 15
            ? Math.atan2(drift.y, drift.x) + (extraRandom() - 0.5) * 3.4
            : extraRandom() * Math.PI * 2;
          const distance = tuning.clearOfPlayer + 4 + extraRandom() * (tuning.reach - tuning.clearOfPlayer - 4);
          spot = { x: Math.round(ahead.x + Math.cos(angle) * distance), y: Math.round(ahead.y + Math.sin(angle) * distance) };
        } else {
          spot = { x: Math.round(soon.x + 16 + extraRandom() * (view.w - 32)), y: Math.round(soon.y + 30 + extraRandom() * (view.h - 44)) };
        }
        if (quietSpot(spot, soon, tuning)) return spot;
      }
      return null;
    }

    function updatePopUps(dt, view) {
      const popUp = TUNING.extras.popUp;
      popUpTimer -= dt;
      if (popUpTimer <= 0) {
        popUpTimer = pick(popUp.gap) * (Math.hypot(drift.x, drift.y) > 15 ? popUp.hurry : 1);
        const spot = visitors.length < popUp.atOnce && popUpSpot(view);
        if (spot) {
          visitors.push({
            x: spot.x, y: spot.y, state: 'mound', timer: popUp.warn, rise: 0, top: 1, looked: 0,
            encores: popUp.encores[Math.floor(extraRandom() * popUp.encores.length)],
          });
        }
      }
      // A visitor heaves up a mound, rises, looks about and sinks; then it may
      // wait under ground and come up again from the same hole.
      const soon = comingView(view, popUp.lead);
      for (const visitor of visitors) {
        // Once the player has left it behind it goes home, making room for another in view.
        if (outside(visitor, view) && outside(visitor, soon)) {
          if (visitor.state === 'mound') visitor.gone = true;
          else leave(visitor);
          continue;
        }
        const startled = near(player, visitor, popUp.duckWithin);
        if (visitor.state === 'mound') {
          visitor.timer -= dt;
          if (startled) visitor.gone = true;   // thinks better of it
          else if (visitor.timer <= 0) surface(visitor);
        } else if (visitor.state === 'rise') {
          visitor.rise = Math.min(visitor.top, visitor.rise + dt / 0.22);
          if (visitor.rise >= visitor.top) {
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
        } else if (visitor.state === 'sink') {
          visitor.rise -= dt / (visitor.hurried ? 0.14 : 0.3);
          if (visitor.rise > 0) continue;
          visitor.rise = 0;
          if (visitor.encores > 0 && !visitor.hurried) {
            visitor.encores--;
            visitor.state = 'under';
            visitor.timer = pick(popUp.under);
          } else {
            leave(visitor);
          }
        } else {
          // Under ground between looks; it stays down if the player is on top of it.
          visitor.timer -= dt;
          if (startled) leave(visitor);
          else if (visitor.timer <= 0) surface(visitor);
        }
      }
      visitors = visitors.filter((visitor) => !visitor.gone);
    }

    // A visitor breaks the surface, sometimes only as far as its eyes.
    function surface(visitor) {
      visitor.state = 'rise';
      visitor.rise = 0;
      visitor.hurried = false;
      visitor.top = extraRandom() < TUNING.extras.popUp.peekShare ? PEEK : 1;
      world.puff(visitor);
    }

    function leave(visitor) {
      digHole(visitor);
      visitor.gone = true;
    }

    function update(dt) {
      if (!active) return;
      if (dt > 0) {
        const pace = (now, before) => Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, (now - before) / dt));
        const ease = Math.min(1, dt * 5);
        const slow = Math.min(1, dt * 0.6);
        trend.x += (pace(player.x, lastSpot.x) - trend.x) * slow;
        trend.y += (pace(player.y, lastSpot.y) - trend.y) * slow;
        drift.x += (pace(player.x, lastSpot.x) - drift.x) * ease;
        drift.y += (pace(player.y, lastSpot.y) - drift.y) * ease;
        lastSpot = { x: player.x, y: player.y };
      }
      updateJay(dt);
      updateHog(dt);
      for (const squirrel of squirrels) updateSquirrel(squirrel, dt);
      const view = world.view();
      updateFlyBys(dt, view);
      updatePerchers(dt, view);
      updatePopUps(dt, view);
      for (const hole of holes) hole.age += dt;
      holes = holes.filter((hole) => hole.age < HOLE_LIFE);
    }

    // ---- what to draw (all in park coordinates) ----

    // In its hole with its head showing, or out of it altogether (only the thief goes that far).
    const isUp = (groundhog) => ['rise', 'look', 'climb', 'sink'].includes(groundhog.state);
    const isOut = (groundhog) => groundhog.state === 'fetch' || groundhog.state === 'back';
    const holeOf = (groundhog) => groundhog.home || groundhog;

    // Flat on the ground, under everything else.
    function decals() {
      if (!active) return [];
      const list = holes.map((hole) => (hole.age > HOLE_LIFE - HOLE_FILLING
        ? { sprite: Sprites.mound[0], x: hole.x - 8, y: hole.y - 4 }
        : { sprite: Sprites.hole, x: hole.x - 8, y: hole.y - 3 }));
      for (const groundhog of [hog, ...visitors]) {
        // Its hole is open while it is up or out, and while a visitor waits below between looks.
        if (isUp(groundhog) || isOut(groundhog) || groundhog.state === 'under') {
          list.push({ sprite: Sprites.hole, x: holeOf(groundhog).x - 8, y: holeOf(groundhog).y - 3 });
        }
      }
      return list;
    }

    function shadows() {
      if (!active) return [];
      // A jay sitting in a tree casts none: the tree's own shadow is there.
      const onTheGround = perchers.filter((bird) => bird.state !== 'sit' || !bird.spot.tree);
      const list = [...squirrels, ...passers, ...onTheGround].map((creature) => ({ x: Math.round(creature.x), y: Math.round(creature.y) }));
      if (jay.state !== 'away') list.push({ x: Math.round(jay.x), y: Math.round(jay.y) });
      if (isOut(hog)) list.push({ x: Math.round(hog.x), y: Math.round(hog.y) });
      return list;
    }

    // A groundhog at its hole, as depth-sorted pieces: heaving dirt before it
    // surfaces, then its body rising behind the hole's near rim.
    function groundhogPieces(list, groundhog, clock, body) {
      const hole = holeOf(groundhog);
      if (groundhog.state === 'mound') {
        list.push({ sprite: Sprites.mound[Math.floor(clock * 8) % 2], x: hole.x - 8, y: hole.y - 4, depth: hole.y });
      } else if (isUp(groundhog)) {
        const showing = Math.round(Math.max(0, groundhog.rise) * body.height);
        if (showing > 0) {
          list.push({ sprite: body, x: hole.x - 8, y: hole.y - showing, clip: showing, depth: hole.y });
          if (groundhog.carrying && showing > 3) {
            // Held up beside its cheek, so the prize is visible as it sinks.
            list.push({ sprite: Sprites.acorn, x: hole.x + 2, y: hole.y - showing + 3, clip: Math.min(Sprites.acorn.height, showing - 3), depth: hole.y + 0.05 });
          }
        }
        list.push({ sprite: Sprites.holeFront, x: hole.x - 8, y: hole.y, depth: hole.y + 0.1 });
      }
    }

    // Standing on the ground, sorted by depth with the scenery. `clip` draws only the top rows.
    function things(clock) {
      if (!active) return [];
      const list = squirrels.map((squirrel) => {
        const poses = Sprites.greySquirrel[squirrel.facing];
        const hop = squirrel.moving ? [0, 1, 2, 1][Math.floor(squirrel.hop * 12) % 4] : Sprites.joyLift(squirrel.joy, JOY_HEIGHT.squirrel);
        return {
          sprite: squirrel.moving ? poses.rest : Sprites.idleFrame(poses, squirrel.idle),
          x: Math.round(squirrel.x) - 8, y: Math.round(squirrel.y) - 15 - hop, depth: squirrel.y,
        };
      });
      // The thief glances about before it climbs out; a visitor does so all the while it is up.
      groundhogPieces(list, hog, clock, hog.state === 'look' ? Sprites.groundhogLooks[Math.floor(hog.looked / 0.28) % 4] : Sprites.groundhog);
      if (isOut(hog)) {
        // Legs still while it jumps for joy; its prize goes up and down with it.
        const lift = Sprites.joyLift(hog.joy, JOY_HEIGHT.groundhog);
        const body = Sprites.groundhogWalk[hog.facing][hog.joy > 0 ? 0 : Math.floor(hog.step * 10) % 2];
        const x = Math.round(hog.x);
        const y = Math.round(hog.y) - lift;
        list.push({ sprite: body, x: x - (body.width >> 1), y: y - body.height, depth: hog.y });
        // Its prize goes home in its mouth.
        if (hog.carrying) list.push({ sprite: Sprites.acorn, x: hog.facing === 'left' ? x - 14 : x + 6, y: y - 11, depth: hog.y + 0.05 });
      }
      for (const visitor of visitors) {
        groundhogPieces(list, visitor, clock, Sprites.groundhogLooks[Math.floor(visitor.looked / 0.45) % 4]);
      }
      for (const bird of perchers) {
        if (bird.state !== 'sit') continue;
        // Placed afresh from the wind, so it stays on a tree top exactly as that is drawn.
        const seat = seatOf(bird.spot);
        const sprite = Sprites.jaySitting[bird.facing][JAY_LOOKS[Math.floor(bird.looked / bird.beat) % JAY_LOOKS.length]];
        list.push({ sprite, x: Math.round(seat.x) - (sprite.width >> 1), y: Math.round(seat.y - seat.z) - sprite.height, depth: seat.y + 0.01 });
      }
      return list;
    }

    // In the air, drawn over everything on the ground.
    function flyers() {
      if (!active) return [];
      const list = [...passers, ...perchers.filter((bird) => bird.state !== 'sit')].map((bird) => ({
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
      inspect: () => ({ jay, hog, squirrels, holes, passers, perchers, visitors }),
    };
  }

  return { create };
})();
