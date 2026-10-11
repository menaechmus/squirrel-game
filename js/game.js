// The game itself: loop, movement, camera, drawing, scoring and menus.

(() => {
  const VIEW_SHORT = 180;    // game pixels along the screen's shorter side
  const SPEED = 80;          // game pixels per second
  const PLAYER_RADIUS = 4;
  const PICKUP_RADIUS = 11;
  const HINT_WHEN_LEFT = 3;  // point towards the last few acorns
  const BEST_KEY = 'squirrel-game-best-haul';
  const RIVAL_NAMES = { jays: 'Blue jays', groundhogs: 'Groundhogs', squirrels: 'Grey squirrels' };
  // Each sound is a few square-wave notes: [frequency, delay, length].
  const SOUNDS = {
    pickup: [[880, 0, 0.08], [1320, 0.07, 0.12]],
    stolen: [[520, 0, 0.09], [390, 0.08, 0.14]],
    chirp: [[2100, 0, 0.05], [2600, 0.07, 0.05], [2100, 0.14, 0.06]],
    scared: [[1500, 0, 0.05], [1100, 0.05, 0.08]],
    rumble: [[110, 0, 0.12], [95, 0.1, 0.12]],
    pop: [[300, 0, 0.05], [450, 0.04, 0.06]],
    finish: [[523, 0, 0.25], [659, 0.12, 0.25], [784, 0.24, 0.25], [1047, 0.36, 0.25]],
  };

  const el = (id) => document.getElementById(id);
  const canvas = el('game');
  const ctx = canvas.getContext('2d');

  const level = Level.generate();
  const ground = Scenery.buildGround(level);
  const pond = Scenery.buildPond(level);
  const effects = Effects.create(level);
  const total = level.acorns.length;

  // Test hooks: ?autoplay=N plays by itself at N times speed, &pace=0.4 slows
  // the test squirrel to 40% (closer to a person), &seed=7 varies the rivals' luck.
  const params = new URLSearchParams(location.search);
  const auto = params.has('autoplay')
    ? { speed: Number(params.get('autoplay')) || 1, pace: Number(params.get('pace')) || 1, target: null, best: Infinity, stalled: 0, noclip: 0, noclips: 0 }
    : null;
  const random = seededRandom(params.has('seed') ? Number(params.get('seed')) : auto ? 1 : Date.now());

  const player = { x: level.spawn.x, y: level.spawn.y, facing: 'down', moving: false, hop: 0 };
  const counts = { you: 0, jays: 0, groundhogs: 0, squirrels: 0 };
  let state = 'menu';   // 'menu' | 'playing' | 'over'
  let acorns = [];
  let particles = [];
  let time = 0;
  let clock = 0;        // always running, for animation
  let viewW = 0;
  let viewH = 0;
  let audio = null;
  let muted = false;

  const rivals = Rivals.create({ level, player, acorns: () => acorns, take: takeAcorn, random, sound });

  // ---- screen ----

  function resize() {
    // Scale by a whole number of real screen pixels so every game pixel is square and crisp.
    const ratio = window.devicePixelRatio || 1;
    const screenW = Math.round(window.innerWidth * ratio);
    const screenH = Math.round(window.innerHeight * ratio);
    const zoom = Math.max(1, Math.floor(Math.min(screenW, screenH) / VIEW_SHORT));
    viewW = Math.ceil(screenW / zoom);
    viewH = Math.ceil(screenH / zoom);
    canvas.width = viewW;
    canvas.height = viewH;
    canvas.style.width = (viewW * zoom) / ratio + 'px';
    canvas.style.height = (viewH * zoom) / ratio + 'px';
    ctx.imageSmoothingEnabled = false;
  }

  // ---- sound ----

  function beep(frequency, delay, length, volume) {
    if (!audio || muted) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + delay;
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.05 * volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + length);
  }

  // Play a named sound; one that happens far from the squirrel (`at`) is quieter.
  function sound(name, at) {
    const distance = at ? Math.hypot(at.x - player.x, at.y - player.y) : 0;
    const volume = Math.max(0.2, 1 - distance / 400);
    for (const [frequency, delay, length] of SOUNDS[name]) beep(frequency, delay, length, volume);
  }

  function unlockAudio() {
    // Browsers only allow sound after a tap or click, so this runs from the Play button.
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
    } catch (error) {
      audio = null;
    }
  }

  // ---- game flow ----

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return minutes + ':' + (seconds - minutes * 60).toFixed(1).padStart(4, '0');
  }

  function readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (error) {
      return 0;
    }
  }

  function saveBest(haul) {
    try {
      localStorage.setItem(BEST_KEY, String(haul));
    } catch (error) {
      // Private browsing or storage disabled: the game works without it.
    }
  }

  function updateHud() {
    el('acorns').textContent = `Acorns ${counts.you} \u00b7 ${acorns.length} left`;   // \u00b7 is a middle dot
    el('time').textContent = formatTime(time);
  }

  function start() {
    player.x = level.spawn.x;
    player.y = level.spawn.y;
    player.facing = 'down';
    acorns = level.acorns.map((acorn, index) => ({ x: acorn.x, y: acorn.y, phase: index, claimedBy: null, gone: false }));
    for (const who of Object.keys(counts)) counts[who] = 0;
    particles = [];
    time = 0;
    state = 'playing';
    rivals.reset();
    Input.release();
    el('start').hidden = true;
    el('over').hidden = true;
    el('hud').hidden = false;
    updateHud();
  }

  function burst(acorn, color, speed) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      particles.push({ x: acorn.x, y: acorn.y - 6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0.4, color });
    }
  }

  // Someone picks up an acorn: the player ('you') or a kind of rival.
  function takeAcorn(acorn, who) {
    if (acorn.gone) return;
    acorn.gone = true;
    acorns = acorns.filter((other) => other !== acorn);
    counts[who]++;
    if (who === 'you') {
      burst(acorn, '#f0c670', 40);
      sound('pickup');
    } else {
      burst(acorn, '#e8e8f0', 22);
      sound('stolen', acorn);
    }
    updateHud();
    if (acorns.length === 0) finish();
  }

  // The park is empty: show who got what.
  function finish() {
    state = 'over';
    Input.release();
    sound('finish');
    const mostByRival = Math.max(counts.jays, counts.groundhogs, counts.squirrels);
    el('verdict').textContent = counts.you * 2 >= total ? 'Winter is sorted!'
      : counts.you > mostByRival ? 'Enough to get by' : 'A lean winter...';
    el('result').textContent = `You gathered ${counts.you} of ${total} acorns in ${formatTime(time)}`;
    // One label per kind of rival; each stays whole if the line wraps on a narrow screen.
    el('rivals').textContent = '';
    for (const who of Object.keys(RIVAL_NAMES)) {
      const label = document.createElement('span');
      label.textContent = `${RIVAL_NAMES[who]} ${counts[who]}`;
      el('rivals').appendChild(label);
    }
    const best = readBest();
    if (counts.you > best) saveBest(counts.you);
    el('best').textContent = counts.you > best ? 'New best haul!' : `Best haul: ${best}`;
    el('over').hidden = false;
    el('again').focus();
    if (auto) {
      document.body.dataset.result = `you=${counts.you} jays=${counts.jays} groundhogs=${counts.groundhogs} squirrels=${counts.squirrels} total=${total} time=${time.toFixed(1)} noclips=${auto.noclips}`;
      if (params.has('restart')) {
        el('again').click();
        document.body.dataset.restart = `${el('acorns').textContent} ${state} over-hidden=${el('over').hidden}`;
      }
      auto.speed = 0;
    }
  }

  // ---- update ----

  function autoVector(dt) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const acorn of acorns) {
      const distance = Math.hypot(acorn.x - player.x, acorn.y - player.y);
      if (distance < nearestDistance) {
        nearest = acorn;
        nearestDistance = distance;
      }
    }
    if (!nearest) return { x: 0, y: 0 };
    if (nearest !== auto.target) {
      auto.target = nearest;
      auto.best = Infinity;
    }
    // No pathfinding: if scenery blocks the straight line for a while, pass through it.
    if (nearestDistance < auto.best - 1) {
      auto.best = nearestDistance;
      auto.stalled = 0;
    } else {
      auto.stalled += dt;
      if (auto.stalled > 0.5 && auto.noclip <= 0) {
        auto.noclip = 0.6;
        auto.noclips++;
      }
    }
    auto.noclip -= dt;
    return { x: ((nearest.x - player.x) / nearestDistance) * auto.pace, y: ((nearest.y - player.y) / nearestDistance) * auto.pace };
  }

  function update(dt) {
    clock += dt;
    effects.update(dt, clock);
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 160 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    if (state === 'menu') return;

    // After the round the rivals carry on, so a jay still flies off with its prize.
    rivals.update(dt);
    if (state !== 'playing') {
      player.moving = false;
      return;
    }

    time += dt;
    const move = auto ? autoVector(dt) : Input.vector();
    player.moving = Boolean(move.x || move.y);
    if (player.moving) {
      player.x += move.x * SPEED * dt;
      player.y += move.y * SPEED * dt;
      player.hop += dt;
      if (Math.abs(move.x) > Math.abs(move.y)) player.facing = move.x < 0 ? 'left' : 'right';
      else player.facing = move.y < 0 ? 'up' : 'down';
    } else {
      player.hop = 0;
    }
    if (!(auto && auto.noclip > 0)) level.pushOut(player, PLAYER_RADIUS);

    for (const acorn of acorns.slice()) {
      if (Math.hypot(acorn.x - player.x, acorn.y - 3 - player.y) <= PICKUP_RADIUS) takeAcorn(acorn, 'you');
    }
    updateHud();
  }

  // ---- draw ----

  // Follow the squirrel but stop at the park edge; centre the park if the view is bigger than it.
  function cameraOffset(target, view) {
    if (view >= level.size) return Math.round((level.size - view) / 2);
    return Math.round(Math.min(level.size - view, Math.max(0, target - view / 2)));
  }

  function draw() {
    const camX = cameraOffset(player.x, viewW);
    const camY = cameraOffset(player.y, viewH);
    ctx.fillStyle = '#2a6e33';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.drawImage(ground, -camX, -camY);
    ctx.drawImage(pond.frames[effects.pondFrame(clock)], pond.x - camX, pond.y - camY);
    for (const decal of rivals.decals()) ctx.drawImage(decal.sprite, decal.x - camX, decal.y - camY);

    const px = Math.round(player.x) - camX;
    const py = Math.round(player.y) - camY;
    ctx.drawImage(Sprites.shadowSmall, px - 5, py - 2);
    for (const acorn of acorns) {
      ctx.drawImage(Sprites.shadowSmall, acorn.x - 5 - camX, acorn.y - 2 - camY);
    }
    for (const spot of rivals.shadows()) {
      ctx.drawImage(Sprites.shadowSmall, spot.x - 5 - camX, spot.y - 2 - camY);
    }

    // Everything standing on the ground is drawn back-to-front, so creatures
    // can pass behind tree tops and in front of trunks.
    const things = [];
    let behindTree = false;
    for (const prop of level.props) {
      const art = Scenery.props[prop.sprite];
      const width = art.frames[0].width;
      const height = art.frames[0].height;
      const x = prop.x - (width >> 1) - camX;
      const y = prop.y - height - camY;
      if (x < viewW && y < viewH && x + width > 0 && y + height > 0) {
        const sprite = art.frames.length === 1 ? art.frames[0] : Scenery.frame(art, effects.lean(prop.x, prop.y, clock));
        things.push({ sprite, x, y, depth: prop.y });
        if (art.hides && prop.y > player.y && px > x && px < x + width && py - 8 > y && py - 8 < y + height) {
          behindTree = true;
        }
      }
    }
    for (const acorn of acorns) {
      const bob = Math.round(Math.sin(clock * 4 + acorn.phase) * 1.5);
      things.push({ sprite: Sprites.acorn, x: acorn.x - 4 - camX, y: acorn.y - 12 - bob - camY, depth: acorn.y });
    }
    for (const thing of rivals.things(clock)) {
      things.push({ sprite: thing.sprite, x: thing.x - camX, y: thing.y - camY, depth: thing.depth, clip: thing.clip });
    }
    const hop = player.moving ? [0, 1, 2, 1][Math.floor(player.hop * 12) % 4] : 0;
    const squirrel = { sprite: Sprites.squirrel[player.facing], x: px - 8, y: py - 15 - hop, depth: player.y };
    things.push(squirrel);
    things.sort((a, b) => a.depth - b.depth);
    for (const thing of things) {
      if (thing.clip) {
        // Only the top rows: a groundhog partly out of its hole.
        ctx.drawImage(thing.sprite, 0, 0, thing.sprite.width, thing.clip, thing.x, thing.y, thing.sprite.width, thing.clip);
      } else {
        ctx.drawImage(thing.sprite, thing.x, thing.y);
      }
    }
    if (behindTree) {
      // Show a faint squirrel through the leaves so the player never loses track of it.
      ctx.globalAlpha = 0.45;
      ctx.drawImage(squirrel.sprite, squirrel.x, squirrel.y);
      ctx.globalAlpha = 1;
    }

    effects.drawLeaves(ctx, camX, camY);
    for (const flyer of rivals.flyers()) ctx.drawImage(flyer.sprite, flyer.x - camX, flyer.y - camY);
    effects.drawClouds(ctx, camX, camY, viewW, viewH);

    for (const particle of particles) {
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x) - camX, Math.round(particle.y) - camY, 1, 1);
    }

    if (state === 'playing' && acorns.length <= HINT_WHEN_LEFT) drawHint(camX, camY);
  }

  // A blinking marker on the screen edge, pointing at the nearest off-screen acorn.
  function drawHint(camX, camY) {
    let nearest = null;
    for (const acorn of acorns) {
      if (!nearest || Math.hypot(acorn.x - player.x, acorn.y - player.y) < Math.hypot(nearest.x - player.x, nearest.y - player.y)) {
        nearest = acorn;
      }
    }
    if (!nearest) return;
    const x = nearest.x - camX;
    const y = nearest.y - 6 - camY;
    if ((x >= 0 && x < viewW && y >= 0 && y < viewH) || Math.floor(clock * 3) % 2) return;
    const hx = Math.min(viewW - 7, Math.max(3, x));
    const hy = Math.min(viewH - 7, Math.max(3, y));
    ctx.fillStyle = '#2b1d16';
    ctx.fillRect(hx - 1, hy - 1, 6, 6);
    ctx.fillStyle = '#f0c670';
    ctx.fillRect(hx, hy, 4, 4);
  }

  // ---- loop ----

  let last = performance.now();
  function frame(now) {
    // Clamp the step so a paused or hidden tab doesn't jump the squirrel or the clock.
    // (The first frame's timestamp can be a hair earlier than `last`, hence the lower bound.)
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!auto) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Headless test runs rarely get display frames, so autoplay advances on a timer.
  if (auto) {
    setInterval(() => {
      for (let i = 0; i < (auto.speed || 1); i++) update(1 / 60);
    }, 16);
  }

  // ---- setup ----

  el('help').textContent = window.matchMedia('(pointer: coarse)').matches
    ? 'Drag anywhere on the screen to move.'
    : 'Move with WASD or the arrow keys, or drag with the mouse.';
  el('play').addEventListener('click', () => { unlockAudio(); start(); });
  el('again').addEventListener('click', () => { unlockAudio(); start(); });
  el('mute').addEventListener('click', () => {
    muted = !muted;
    el('mute').textContent = muted ? 'Sound off' : 'Sound on';
  });
  window.addEventListener('resize', resize);

  resize();
  if (auto) start();
  requestAnimationFrame(frame);
})();
