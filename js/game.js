// The game itself: loop, movement, collision, camera, drawing and menus.

(() => {
  const VIEW_SHORT = 180;    // game pixels along the screen's shorter side
  const SPEED = 80;          // game pixels per second
  const PLAYER_RADIUS = 4;
  const PICKUP_RADIUS = 11;
  const HINT_WHEN_LEFT = 3;  // point towards the last few acorns
  const BEST_KEY = 'squirrel-game-best';

  const el = (id) => document.getElementById(id);
  const canvas = el('game');
  const ctx = canvas.getContext('2d');

  const level = Level.generate();
  const ground = Sprites.buildGround(level);
  const solids = level.props.filter((prop) => prop.solid).map((prop) => prop.solid);
  const total = level.acorns.length;

  const player = { x: 0, y: 0, facing: 'down', moving: false, hop: 0 };
  let state = 'menu';   // 'menu' | 'playing' | 'won'
  let acorns = [];
  let particles = [];
  let time = 0;
  let clock = 0;        // always running, for animation
  let viewW = 0;
  let viewH = 0;
  let audio = null;
  let muted = false;

  // ?autoplay=N walks the squirrel to every acorn at N times speed (for testing).
  const params = new URLSearchParams(location.search);
  const auto = params.has('autoplay')
    ? { speed: Number(params.get('autoplay')) || 1, best: Infinity, stalled: 0, noclip: 0, noclips: 0 }
    : null;

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

  function beep(frequency, delay, length) {
    if (!audio || muted) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + delay;
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.05, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + length);
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
      return Number(localStorage.getItem(BEST_KEY)) || null;
    } catch (error) {
      return null;
    }
  }

  function saveBest(seconds) {
    try {
      localStorage.setItem(BEST_KEY, String(seconds));
    } catch (error) {
      // Private browsing or storage disabled: the game works without it.
    }
  }

  function updateHud() {
    el('acorns').textContent = `Acorns ${total - acorns.length}/${total}`;
    el('time').textContent = formatTime(time);
  }

  function start() {
    player.x = level.spawn.x;
    player.y = level.spawn.y;
    player.facing = 'down';
    acorns = level.acorns.map((acorn, index) => ({ x: acorn.x, y: acorn.y, phase: index }));
    particles = [];
    time = 0;
    state = 'playing';
    Input.release();
    el('start').hidden = true;
    el('win').hidden = true;
    el('hud').hidden = false;
    updateHud();
  }

  function win() {
    state = 'won';
    Input.release();
    [523, 659, 784, 1047].forEach((note, index) => beep(note, index * 0.12, 0.25));
    const best = readBest();
    const isBest = !best || time < best;
    if (isBest) saveBest(time);
    el('result').textContent = `All ${total} acorns in ${formatTime(time)}`;
    el('best').textContent = isBest ? 'New best time!' : `Best: ${formatTime(best)}`;
    el('win').hidden = false;
    el('again').focus();
    if (auto) {
      document.body.dataset.result = `${total - acorns.length}/${total} noclips=${auto.noclips}`;
      if (params.has('restart')) {
        el('again').click();
        document.body.dataset.restart = `${el('acorns').textContent} ${state} win-hidden=${el('win').hidden}`;
      }
      auto.speed = 0;
    }
  }

  // ---- update ----

  function pushOutOfSolids() {
    for (let pass = 0; pass < 2; pass++) {
      for (const solid of solids) {
        const dx = player.x - solid.x;
        const dy = player.y - solid.y;
        const reach = solid.r + PLAYER_RADIUS;
        if (dx * dx + dy * dy < reach * reach) {
          const distance = Math.hypot(dx, dy) || 0.01;
          player.x = solid.x + (dx / distance) * reach;
          player.y = solid.y + (dy / distance) * reach;
        }
      }
      // The pond blocks a little further down the screen than it is drawn,
      // so the squirrel's body never overlaps the water.
      const pond = level.pond;
      const a = pond.a + PLAYER_RADIUS;
      const b = pond.b + PLAYER_RADIUS + 5;
      const nx = (player.x - pond.x) / a;
      const ny = (player.y - (pond.y + 5)) / b;
      const n = Math.hypot(nx, ny);
      if (n < 1) {
        player.x = pond.x + (nx / (n || 0.01)) * a;
        player.y = pond.y + 5 + (ny / (n || 0.01)) * b;
      }
    }
  }

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
    return { x: (nearest.x - player.x) / nearestDistance, y: (nearest.y - player.y) / nearestDistance };
  }

  function update(dt) {
    clock += dt;
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 160 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
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
    if (!(auto && auto.noclip > 0)) pushOutOfSolids();
    const edge = level.border + PLAYER_RADIUS;
    player.x = Math.min(level.size - edge, Math.max(edge, player.x));
    player.y = Math.min(level.size - edge, Math.max(edge + 10, player.y));

    const before = acorns.length;
    acorns = acorns.filter((acorn) => {
      if (Math.hypot(acorn.x - player.x, acorn.y - 3 - player.y) > PICKUP_RADIUS) return true;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        particles.push({ x: acorn.x, y: acorn.y - 6, vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40 - 30, life: 0.4 });
      }
      return false;
    });
    if (acorns.length !== before) {
      beep(880, 0, 0.08);
      beep(1320, 0.07, 0.12);
      if (auto) auto.best = Infinity;
      if (acorns.length === 0) win();
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

    const px = Math.round(player.x) - camX;
    const py = Math.round(player.y) - camY;
    ctx.drawImage(Sprites.shadowSmall, px - 5, py - 2);
    for (const acorn of acorns) {
      ctx.drawImage(Sprites.shadowSmall, acorn.x - 5 - camX, acorn.y - 2 - camY);
    }

    // Everything standing on the ground is drawn back-to-front, so the
    // squirrel can pass behind tree tops and in front of trunks.
    const things = [];
    let behindTree = false;
    for (const prop of level.props) {
      const sprite = Sprites.props[prop.sprite];
      const x = prop.x - Math.floor(sprite.width / 2) - camX;
      const y = prop.y - sprite.height - camY;
      if (x < viewW && y < viewH && x + sprite.width > 0 && y + sprite.height > 0) {
        things.push({ sprite, x, y, depth: prop.y });
        if (sprite.height > 24 && prop.y > player.y
            && px > x && px < x + sprite.width && py - 8 > y && py - 8 < y + sprite.height) {
          behindTree = true;
        }
      }
    }
    for (const acorn of acorns) {
      const bob = Math.round(Math.sin(clock * 4 + acorn.phase) * 1.5);
      things.push({ sprite: Sprites.acorn, x: acorn.x - 4 - camX, y: acorn.y - 12 - bob - camY, depth: acorn.y });
    }
    const hop = player.moving ? [0, 1, 2, 1][Math.floor(player.hop * 12) % 4] : 0;
    const squirrel = { sprite: Sprites.squirrel[player.facing], x: px - 8, y: py - 15 - hop, depth: player.y };
    things.push(squirrel);
    things.sort((a, b) => a.depth - b.depth);
    for (const thing of things) ctx.drawImage(thing.sprite, thing.x, thing.y);
    if (behindTree) {
      // Show a faint squirrel through the leaves so the player never loses track of it.
      ctx.globalAlpha = 0.45;
      ctx.drawImage(squirrel.sprite, squirrel.x, squirrel.y);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#f0c670';
    for (const particle of particles) {
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
    const dt = Math.min(0.05, (now - last) / 1000);
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
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  if (auto) start();
  requestAnimationFrame(frame);
})();
