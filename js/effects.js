// Weather: the wind that everything sways to, drifting cloud shadows, the
// pond's ripple timing, leaves shaken loose in gusts, and the cabin's smoke.

const Effects = (() => {
  const POND_FRAMES_PER_SECOND = 2.5;
  const CLOUD_SPEED = 13;       // game pixels per second
  const LEAF_GUST = 1.5;        // wind strength at which trees start shedding
  const LEAVES_PER_SECOND = 0.5;
  // Chimney smoke: a puff this often (seconds), each lasting this long, rising
  // this fast (pixels a second) and drifting sideways with the wind.
  const SMOKE = { every: 0.42, life: 3.4, rise: 13, drift: 6, faint: 0.45 };

  // How hard the wind pushes at a spot, roughly -1 (swinging back) to 2.5 (gust).
  // A slow swell and occasional strong gusts both travel left to right across
  // the park, with a little flutter on top so neighbours don't move in lockstep.
  function lean(x, y, clock) {
    const swell = Math.sin(clock * 0.9 - x * 0.012 + y * 0.004);
    const blow = gust(x, clock);
    const flutter = Math.sin(clock * 5.3 + x * 0.37 + y * 0.21);
    return swell * 0.6 + blow * 1.6 + flutter * (0.12 + blow * 0.3);
  }

  // How much of a gust is passing a spot, 0 to 1: one comes across the park
  // about every 18 seconds and takes a few seconds to blow through.
  function gust(x, clock) {
    return Math.max(0, Math.sin(clock * 0.35 - x * 0.004 + 1)) ** 3;
  }

  function create(level) {
    const rand = seededRandom(404);
    const shedders = level.props.filter((prop) => Scenery.props[prop.sprite].leaves);
    const clouds = Scenery.clouds.map((sprite, index) => ({
      sprite,
      x: rand() * (level.size + sprite.width) - sprite.width,
      y: (index / Scenery.clouds.length) * level.size + rand() * 60 - 30,
      speed: CLOUD_SPEED * (0.8 + rand() * 0.5),
    }));
    let leaves = [];

    function update(dt, clock) {
      for (const cloud of clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > level.size + 20) cloud.x = -cloud.sprite.width - 20;
      }
      for (const tree of shedders) {
        if (rand() < LEAVES_PER_SECOND * dt && lean(tree.x, tree.y, clock) > LEAF_GUST) {
          const art = Scenery.props[tree.sprite];
          const sprite = art.frames[0];
          leaves.push({
            x: tree.x + (rand() - 0.5) * sprite.width * 0.6,
            y: tree.y - sprite.height * (0.45 + rand() * 0.35),
            vx: 45 + rand() * 35,
            vy: 10 + rand() * 14,
            life: 1.2 + rand() * 1.2,
            wobble: rand() * 6,
            color: art.leaves,
          });
        }
      }
      for (const leaf of leaves) {
        leaf.x += leaf.vx * dt;
        leaf.y += (leaf.vy + Math.sin(clock * 9 + leaf.wobble) * 18) * dt;
        leaf.life -= dt;
      }
      leaves = leaves.filter((leaf) => leaf.life > 0);
    }

    function drawLeaves(ctx, camX, camY) {
      for (const leaf of leaves) {
        ctx.fillStyle = leaf.color;
        ctx.fillRect(Math.round(leaf.x) - camX, Math.round(leaf.y) - camY, 2, 1);
      }
    }

    // Light smoke from the cabin's chimney: puffs that rise, grow and fade, each
    // carried sideways by the wind it met on the way up. It goes by the clock,
    // so it stands still while the game is paused.
    function drawSmoke(ctx, camX, camY, chimney, clock) {
      const puffs = Scenery.props.cabin.puffs;
      const newest = Math.floor(clock / SMOKE.every);
      ctx.save();
      for (let k = Math.ceil(SMOKE.life / SMOKE.every); k >= 0; k--) {
        const born = (newest - k) * SMOKE.every;
        const age = clock - born;
        if (age < 0 || age >= SMOKE.life) continue;
        // The wind along the way, sampled four times; the park's breeze mostly
        // blows to the right, so the smoke leans that way unless it swings back.
        let drift = 0;
        for (let i = 0; i < 4; i++) {
          const then = ((i + 0.5) / 4) * age;
          drift += (0.5 + lean(chimney.x, chimney.y - SMOKE.rise * then, born + then)) * (age / 4);
        }
        const x = chimney.x + drift * SMOKE.drift + Math.sin(age * 2.2 + (newest - k) * 1.7) * 1.2;
        const y = chimney.y - SMOKE.rise * age + 0.6 * age * age;
        const sprite = puffs[age < 0.45 ? 0 : age < 1.2 ? 1 : age < 2.1 ? 2 : 3];
        ctx.globalAlpha = SMOKE.faint * (1 - age / SMOKE.life);
        ctx.drawImage(sprite, Math.round(x - sprite.width / 2) - camX, Math.round(y - sprite.height / 2) - camY);
      }
      ctx.restore();
    }

    function drawClouds(ctx, camX, camY, viewW, viewH) {
      for (const cloud of clouds) {
        const x = Math.round(cloud.x) - camX;
        const y = Math.round(cloud.y) - camY;
        if (x < viewW && y < viewH && x + cloud.sprite.width > 0 && y + cloud.sprite.height > 0) {
          ctx.drawImage(cloud.sprite, x, y);
        }
      }
    }

    return {
      lean,
      gust,
      pondFrame: (clock) => Math.floor(clock * POND_FRAMES_PER_SECOND) % 4,
      update,
      drawLeaves,
      drawSmoke,
      drawClouds,
    };
  }

  return { create };
})();
