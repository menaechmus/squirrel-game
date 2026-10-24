// The game itself: loop, movement, camera, drawing, scoring and menus.

(() => {
  const VIEW_SHORT = 180;    // game pixels along the screen's shorter side
  const SPEED = 80;          // game pixels per second
  const PLAYER_RADIUS = 4;
  const PICKUP_RADIUS = 11;
  const HINT_ARROWS = 3;     // arrows point to this many of the nearest acorns out of sight
  const ARROW_BLINK = [0.5, 0.2];   // seconds shown, seconds hidden
  const TURN_BEFORE_SNIFF = 0.3;    // the squirrel turns towards an acorn this long before each round of sniffs
  const JOY_HEIGHT = 4;             // pixels it jumps for joy on getting an acorn
  const MINIMAP_SHARE = 0.18;       // minimap width as a share of the screen's shorter side
  const BEST_KEY = 'squirrel-game-best-haul';
  const RIVAL_NAMES = { jays: 'Blue jays', groundhogs: 'Groundhogs', squirrels: 'Grey squirrels' };
  const SOUND_KEY = 'squirrel-game-sound';   // 'off' once the player has turned sound off
  const GROW_BACK = [1, 3];    // in Explore, seconds before a taken acorn grows back somewhere else
  const DOOR_NEAR = 28;        // the cabin's door opens when the squirrel is this close to it
  const DOOR_SWING = [0.25, 0.45];   // seconds the door takes to swing open, and to shut
  const ROOF_FADE = 0.25;      // seconds the cabin's roof takes to lift off, or come back
  // Games with friends (1.13; up to four players since 1.14).
  const NAME_KEY = 'squirrel-game-name';     // the name typed for games with friends, kept on the phone
  const TOKEN_KEY = 'squirrel-game-token';   // this tab, kept per tab, so the host knows it again after a drop
  const SEND_EVERY = 0.05;   // seconds between the positions each phone sends
  const QUIET = 2;           // seconds without a word from a phone before the game waits for it
  const START_SPOTS = [-8, 8, -24, 24];   // where each seat's squirrel starts, left or right of the crossing
  const COUNTDOWN = 3;       // seconds of "3, 2, 1" before a round with friends, so every phone says Go together
  // Each seat's squirrel, for the map, the top bar and the panel: the host's
  // orange, then black, white and brown.
  const COAT_COLORS = ['#d0702c', '#4f4842', '#ece6da', '#83532f'];
  // A squirrel's head for the top bar in a game with friends, 10 by 8 pixels:
  // '#' its coat, '+' a light rim, 'e' its eyes.
  const HEAD = ['.+......+.', '+#+....+#+', '+##++++##+', '+########+', '+#e####e#+', '+########+', '.+######+.', '..++++++..'];
  // The pause button's picture: two upright bars, 14 by 10 pixels like the speaker.
  const PAUSE_BARS = ['....##..##....', '....##..##....', '....##..##....', '....##..##....', '....##..##....',
    '....##..##....', '....##..##....', '....##..##....', '....##..##....', '....##..##....'];
  // The speaker on the sound buttons, a pixel picture in three layers, each row
  // marking its pixels with '#': the speaker, its sound waves (shown with sound
  // on) and a cross (with sound off). 14 by 10 pixels.
  const SPEAKER = {
    body: ['......#', '.....##', '....###', '#######', '#######', '#######', '#######', '....###', '.....##', '......#'],
    waves: ['', '..........#', '...........#', '........#...#', '.........#..#', '.........#..#', '........#...#', '...........#', '..........#', ''],
    cross: ['', '', '........#....#', '.........#..#', '..........##', '..........##', '.........#..#', '........#....#', '', ''],
  };

  const el = (id) => document.getElementById(id);
  const canvas = el('game');
  const ctx = canvas.getContext('2d');
  const minimap = el('minimap');
  const minimapCtx = minimap.getContext('2d');

  const level = Level.generate();
  const ground = Scenery.buildGround(level);
  const pond = Scenery.buildPond(level);
  const brook = Scenery.buildBrook(level);   // the stream, the second pond and the log bridges
  const miniature = Hud.buildMinimap(level);
  const effects = Effects.create(level);
  const total = level.acorns.length;
  const cabin = level.cabin;
  const cabinArt = Scenery.props.cabin;

  // Test hooks: ?autoplay=N plays by itself at N times speed, &pace=0.4 slows
  // the test squirrel to 40% (closer to a person; 0 parks it), &seed=7 varies
  // the rivals' luck, &mode=explore plays Explore instead of the race, &house
  // sends the test squirrel into the cabin for the golden acorn first.
  const params = new URLSearchParams(location.search);
  const auto = params.has('autoplay')
    ? {
      speed: Number(params.get('autoplay')) || 1, pace: params.has('pace') ? Number(params.get('pace')) : 1, target: null, way: null, leg: 0, best: Infinity, stalled: 0, noclip: 0, noclips: 0,
      grown: [], fewest: Infinity, most: 0, reported: -1,   // Explore: acorns grown back, and how many lay about at the fewest and most
      house: params.has('house') ? { way: null, leg: 0, done: false, log: {} } : null,
    }
    : null;
  const random = seededRandom(params.has('seed') ? Number(params.get('seed')) : auto ? 1 : Date.now());
  const reportsWanted = params.has('report');   // the test page for games with friends wants to hear how things stand
  // This copy's version, from the About panel: in a game with friends every
  // phone needs the same one, as each builds the park from the same seed.
  // (The test page can pretend otherwise, with &version.)
  const VERSION = Net.testing && params.has('version') ? params.get('version') : (el('version').textContent.match(/Version ([\d.]+)/) || [])[1] || '';

  const player = { x: level.spawn.x, y: level.spawn.y, facing: 'down', moving: false, hop: 0, idle: 0, sniffRound: -1, joy: 0 };
  const counts = { you: 0, jays: 0, groundhogs: 0, squirrels: 0 };   // the other players' are in `duo.hauls`
  let duo = null;       // a game with friends (see "games with friends" below), or null
  let state = 'menu';   // 'menu' | 'playing' | 'over'
  let mode = 'race';    // 'race': the park empties and the round ends; 'explore': acorns grow back, no clock
  let paused = false;
  let growing = [];     // in Explore, when each taken acorn grows back (seconds of `time`)
  let nextPhase = 0;    // each acorn bobs a little out of step with the rest
  let nextId = 0;       // each acorn has an id, so two phones can talk about it
  let readyIn = 0;      // seconds of the countdown left before a round with friends begins (Infinity: not yet known)
  let helpFrom = null;  // the panel the help was opened from, to go back to
  let door = 0;         // the cabin's door: 0 shut, 1 wide open
  let indoors = 0;      // 0 with the cabin's roof on, 1 with it lifted off (the squirrel inside)
  let golden = null;    // who found the golden acorn this round: null, 'you', or 'friend' (another player: `duo.goldenSeat`)
  let acorns = [];
  let particles = [];
  let time = 0;
  let clock = 0;        // always running, for animation
  let viewW = 0;
  let viewH = 0;
  // Where the HUD sits, in game pixels, so hint arrows can keep clear of it.
  let hudBottom = 0;
  let minimapBox = { left: 0, top: 0, right: 0, bottom: 0 };
  let othersBox = null;   // the others' counts under the top bar, with three or four players
  const sounds = Sound.create();

  const world = {
    level, player, acorns: () => acorns, take: takeAcorn, random, sound, view: cameraView, puff, splash,
    wind: (x, y) => effects.lean(x, y, clock),
  };
  // One player has the thieves to contend with; friends race each other, with
  // only the wildlife for show about.
  const rivalsAlone = Rivals.create(world);
  const rivalsTogether = Rivals.create(Object.assign({}, world, { thieves: false }));
  let rivals = rivalsAlone;
  // Fish and ducks (1.15), only for show. Each round they are seeded from a
  // run of random numbers of their own, never the thieves'.
  const waterLife = WaterLife.create({ level, player, view: cameraView, splash });
  const waterSeeds = seededRandom((params.has('seed') ? Number(params.get('seed')) : auto ? 1 : Date.now()) ^ 0x5bd1e995);

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
    // The minimap gets a whole-number scale of its own.
    const mapZoom = Math.max(1, Math.round((Math.min(screenW, screenH) * MINIMAP_SHARE) / minimap.width));
    minimap.style.width = (minimap.width * mapZoom) / ratio + 'px';
    minimap.style.height = (minimap.height * mapZoom) / ratio + 'px';
    measureHud();
  }

  function measureHud() {
    const perCssPixel = viewW / canvas.getBoundingClientRect().width;
    const row = el('hud-row').getBoundingClientRect();
    const map = minimap.getBoundingClientRect();
    // The golden acorn, once found, sits under the map: arrows keep clear of both.
    const icon = el('golden').hidden ? map : el('golden').getBoundingClientRect();
    hudBottom = row.bottom * perCssPixel;
    minimapBox = {
      left: Math.min(map.left, icon.left) * perCssPixel, top: map.top * perCssPixel,
      right: Math.max(map.right, icon.right) * perCssPixel, bottom: Math.max(map.bottom, icon.bottom) * perCssPixel,
    };
    // With three or four players, arrows keep clear of the others' counts too.
    const others = el('others').getBoundingClientRect();
    othersBox = el('others').hidden ? null : {
      left: others.left * perCssPixel, top: others.top * perCssPixel, right: others.right * perCssPixel, bottom: others.bottom * perCssPixel,
    };
  }

  // ---- sound ----

  // Play a named beep; one that happens far from the squirrel (`at`) is quieter.
  function sound(name, at) {
    const distance = at ? Math.hypot(at.x - player.x, at.y - player.y) : 0;
    sounds.beep(name, Math.max(0.2, 1 - distance / 400));
  }

  // Trees whose leaves rustle when a gust comes through.
  const leafy = level.props.filter((prop) => Scenery.props[prop.sprite].hides && Scenery.props[prop.sprite].tops);

  // What the squirrel can hear from where it stands: the nearest water, the
  // waterfall, leaves in a gust (more trees round it, more rustle), the
  // animals up to something (and leaf piles bursting), the cabin's fire, and
  // the windmill's sails (where they are, and how far they have turned).
  let rustles = [];   // leaf piles burst this update (1.17), heard once
  const mill = level.mill;
  function listen(dt) {
    const trees = leafy.filter((tree) => Math.abs(tree.x - player.x) < 110 && Math.abs(tree.y - player.y) < 110).length;
    const gust = Math.max(0, Math.min(1, (effects.gust(player.x, clock) - 0.15) / 0.6));
    sounds.update(dt, {
      listener: player,
      water: level.nearestWater(player.x, player.y),
      falls: { distance: Math.hypot(level.falls.x - player.x, level.falls.y - player.y), dx: level.falls.x - player.x },
      breeze: gust * Math.min(1, trees / 5),
      voices: rivals.voices().concat(waterLife.voices(), rustles),
      fire: { distance: Math.hypot(cabin.hearth.x - player.x, cabin.hearth.y - player.y), dx: cabin.hearth.x - player.x },
      mill: mill && { distance: Math.hypot(mill.x - player.x, mill.y - 30 - player.y), dx: mill.x - player.x, turn: effects.sailTurn() },
    });
  }

  // Sound is on unless the player turned it off last time (remembered in the browser).
  function readSoundChoice() {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch (error) {
      return true;
    }
  }

  function saveSoundChoice(on) {
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch (error) {
      // Private browsing or storage disabled: the choice lasts until the page is closed.
    }
  }

  // The speaker picture as an SVG, one small square per pixel.
  function speakerPicture() {
    const path = (rows) => rows.map((row, y) => [...row].map((pixel, x) => (pixel === '#' ? `M${x} ${y}h1v1h-1z` : '')).join('')).join('');
    return '<svg viewBox="0 0 14 10" aria-hidden="true" shape-rendering="crispEdges">'
      + `<path d="${path(SPEAKER.body)}"/><path class="waves" d="${path(SPEAKER.waves)}"/><path class="cross" d="${path(SPEAKER.cross)}"/></svg>`;
  }

  function pausePicture() {
    const path = PAUSE_BARS.map((row, y) => [...row].map((pixel, x) => (pixel === '#' ? `M${x} ${y}h1v1h-1z` : '')).join('')).join('');
    return `<svg viewBox="0 0 14 10" aria-hidden="true" shape-rendering="crispEdges"><path d="${path}"/></svg>`;
  }

  // Both sound buttons (in the top bar, and on the start and end screens) show the same thing.
  function showSoundChoice() {
    for (const id of ['mute', 'mute-menu']) {
      el(id).classList.toggle('off', !sounds.isOn());
      el(id).setAttribute('aria-pressed', String(sounds.isOn()));
      el(id).title = sounds.isOn() ? 'Sound on' : 'Sound off';
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

  // A squirrel's head as an SVG, in the coat of the player in `seat` (for the top bar and the panel).
  const heads = [];
  function headPicture(seat) {
    if (!heads[seat]) {
      const path = (mark) => HEAD.map((row, y) => [...row].map((pixel, x) => (pixel === mark ? `M${x} ${y}h1v1h-1z` : '')).join('')).join('');
      heads[seat] = '<svg class="head" viewBox="0 0 10 8" aria-hidden="true" shape-rendering="crispEdges">'
        + `<path fill="#f4f0e8" d="${path('+')}"/><path fill="${COAT_COLORS[seat]}" d="${path('#')}"/><path fill="#1a1a1a" d="${path('e')}"/></svg>`;
    }
    return heads[seat];
  }

  // An acorn, for the top bar of a race with friends, where "left" would not fit on a narrow phone.
  let acornIcon = '';

  let hudShown = '';
  function updateHud() {
    // \u00b7 is a middle dot. Explore has no clock and no end, so only what has been gathered.
    if (duo) {
      // Each count beside the head of that player's squirrel, this phone's
      // first; in a race, then an acorn and how many are left. With two
      // players both counts are in the top bar; with three or four, the
      // others' go on a row of their own under it, which a narrow phone has
      // room for.
      if (!acornIcon) acornIcon = `<img class="acorn-icon" src="${Sprites.acorn.toDataURL()}" alt="">`;
      const others = otherSeats();
      const count = (seat) => `${headPicture(seat)}${haulOf(seat)}`;
      const left = mode === 'explore' ? '' : ` ${acornIcon}${acorns.length}`;
      const top = (others.length > 1 ? count(duo.seat) : [duo.seat, ...others].map(count).join(' ')) + left;
      const below = others.length > 1 ? others.map((seat) => `<span>${count(seat)}</span>`).join('') : '';
      const shown = `${top}|${below}`;
      if (shown !== hudShown) {
        el('acorns').innerHTML = top;
        el('others').innerHTML = below;
        el('acorns').setAttribute('aria-label', [`You ${counts.you}`, ...others.map((seat) => `${nameOf(seat)} ${haulOf(seat)}`)].join(', ')
          + (mode === 'explore' ? '' : `, ${acorns.length} acorns left`));
        if (el('others').hidden !== !below) {
          el('others').hidden = !below;
          measureHud();
        }
      }
      hudShown = shown;
    } else {
      el('acorns').textContent = mode === 'explore' ? `Acorns ${counts.you}` : `Acorns ${counts.you} \u00b7 ${acorns.length} left`;
      el('acorns').removeAttribute('aria-label');
      if (!el('others').hidden) {
        el('others').hidden = true;
        othersBox = null;
      }
      hudShown = '';
    }
    el('time').textContent = formatTime(time);
  }

  // A fresh round of the race, or a fresh Explore.
  function start(newMode = mode) {
    mode = newMode;
    paused = false;
    growing = [];
    // With friends, each squirrel starts at its own place by the crossing: the
    // host's just left of it, the second just right, the others further out.
    player.x = level.spawn.x + (duo ? START_SPOTS[duo.seat] : 0);
    player.y = level.spawn.y;
    // Test hook: &spot=x,y starts the squirrel there instead (by the water, say).
    if (auto && params.has('spot')) [player.x, player.y] = params.get('spot').split(',').map(Number);
    player.facing = 'down';
    player.idle = 0;
    player.sniffRound = -1;
    player.joy = 0;
    door = 0;
    indoors = 0;
    golden = null;
    el('golden').hidden = true;
    acorns = level.acorns.map((acorn, index) => ({ id: index, x: acorn.x, y: acorn.y, phase: index, claimedBy: null, gone: false }));
    nextPhase = acorns.length;
    nextId = acorns.length;
    if (duo) {
      duo.hauls = [0, 0, 0, 0];
      for (const other of duo.others.values()) toStart(other);
    }
    for (const who of Object.keys(counts)) counts[who] = 0;
    particles = [];
    time = 0;
    readyIn = 0;
    if (auto) {
      auto.noclips = 0;   // the test hook reports stalls per round...
      auto.piles = 0;     // ...and how many leaf piles were burst, by anyone (1.17)
    }
    state = 'playing';
    rivals = duo ? rivalsTogether : rivalsAlone;
    rivals.reset();
    waterLife.reset(Math.floor(waterSeeds() * 0x7fffffff));
    Input.release();
    for (const panel of ['start', 'over', 'about', 'paused', 'rules', 'duo', 'countdown']) el(panel).hidden = true;
    el('info').hidden = true;   // the About button is only for the start and end screens
    el('mute-menu').hidden = true;   // in play, the sound button is in the top bar
    el('hud').hidden = false;
    el('time').hidden = mode === 'explore';
    if (sounds.context() && !document.hidden) sounds.resume();
    updateHud();
    measureHud();
  }

  function burst(acorn, color, speed) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      particles.push({ x: acorn.x, y: acorn.y - 6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0.4, color });
    }
  }

  // A few drops of water thrown up where a fish leaps or a duck comes down.
  function splash(spot) {
    for (let i = 0; i < 6; i++) {
      const sideways = i - 2.5;
      particles.push({ x: spot.x + sideways, y: spot.y - 1, vx: sideways * 10, vy: -38 - (i % 3) * 10, life: 0.3 + (i % 2) * 0.12, color: i % 2 ? '#ffffff' : '#bfe4ff' });
    }
  }

  // A little dirt thrown up where a groundhog breaks the surface.
  function puff(spot) {
    for (let i = 0; i < 7; i++) {
      const sideways = i - 3;
      particles.push({ x: spot.x + sideways * 2, y: spot.y - 1, vx: sideways * 9, vy: -30 - (i % 3) * 9, life: 0.35 + (i % 2) * 0.1, color: i % 2 ? '#b89462' : '#7d5c3a' });
    }
  }

  // Someone picks up an acorn: the player ('you'), another player in a game
  // with friends ('friend', with their `seat`), or a kind of rival.
  function takeAcorn(acorn, who, seat = -1) {
    if (acorn.gone) return;
    acorn.gone = true;
    acorns = acorns.filter((other) => other !== acorn);
    if (who !== 'friend') counts[who]++;
    else if (seat >= 0) duo.hauls[seat]++;
    if (who === 'you') {
      player.joy = Sprites.cheer(player.joy);   // two jumps for joy, only for show
      burst(acorn, '#f0c670', 40);
      sound('pickup');
      // For the test page: when this squirrel really reached the &first acorn.
      if (auto && params.has('first') && acorn.id === Number(params.get('first'))) auto.firstAt = Date.now();
    } else if (who === 'friend') {
      cheerFor(seat);
      burst(acorn, '#f0c670', 40);
      faintly('pickup', acorn);
    } else {
      burst(acorn, '#e8e8f0', 22);
      sound('stolen', acorn);
    }
    updateHud();
    if (duo) tellTaken(acorn, who, seat);
    // With friends, the host's phone grows acorns back and ends the race.
    if (duo && duo.role === 'guest') return;
    if (mode === 'explore') growing.push(time + GROW_BACK[0] + random() * (GROW_BACK[1] - GROW_BACK[0]));
    else if (acorns.length === 0) finish();
  }

  // In Explore, each taken acorn grows back a few seconds later somewhere out
  // of sight (by the same rules as the park's own acorns), so the park keeps
  // about as many as it started with.
  function growAcorns() {
    const due = growing.filter((when) => when <= time);
    if (!due.length) return;
    growing = growing.filter((when) => when > time);
    for (let i = 0; i < due.length; i++) {
      // Out of sight of every player, with friends.
      const spot = level.newAcornSpot(random, acorns, duo ? [cameraView(), ...otherSeats().map(friendView)] : cameraView());
      if (!spot) {
        growing.push(time + 1);   // nowhere suitable just now: try again in a second
        continue;
      }
      const acorn = { id: nextId++, x: spot.x, y: spot.y, phase: nextPhase++, claimedBy: null, gone: false };
      acorns.push(acorn);
      if (duo) duo.host.send({ t: 'grown', id: acorn.id, x: acorn.x, y: acorn.y });
      if (auto) auto.grown.push([spot.x, spot.y]);
    }
    updateHud();
  }

  // The golden acorn, under the table in the cabin: a prize of its own, never
  // one of `acorns`, so it is not counted, no thief or hint arrow knows of it,
  // and the race ends without it.
  function findGolden() {
    golden = 'you';
    player.joy = Sprites.cheer(player.joy);
    burst(cabin.golden, '#ffe066', 46);
    burst(cabin.golden, '#ffffff', 28);
    sound('golden');
    el('golden').hidden = false;
    measureHud();
    if (duo) tellGolden();
    if (auto && auto.house) {
      // What it asked the sound module for, and where the golden acorn shows (CSS pixels).
      const log = auto.house.log;
      log.chimes = (log.chimes || 0) + 1;
      const box = (id) => { const b = el(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      log.iconAt = { icon: box('golden'), map: box('minimap'), row: box('hud-row'), window: [innerWidth, innerHeight] };
    }
  }

  // The cabin's door opens as a squirrel comes near (anyone's, in a game with
  // friends) and shuts after it has gone; inside the walls, the roof lifts
  // off, on the phone whose squirrel it is.
  const inCabin = (squirrel) => Math.abs(squirrel.x - cabin.x) < cabin.half && squirrel.y < cabin.y && squirrel.y > cabin.y - cabin.depth;
  const byDoor = (squirrel) => inCabin(squirrel) || Math.hypot(squirrel.x - cabin.door.x, squirrel.y - cabin.door.y) < DOOR_NEAR;
  function updateCabin(dt) {
    const inside = inCabin(player);
    const near = byDoor(player) || shownOthers().some(byDoor);
    if (near && door === 0) {
      sounds.creak(Math.max(0, 1 - Math.hypot(cabin.door.x - player.x, cabin.door.y - player.y) / 200));
      if (auto && auto.house) auto.house.log.creaks = (auto.house.log.creaks || 0) + 1;
    }
    door = near ? Math.min(1, door + dt / DOOR_SWING[0]) : Math.max(0, door - dt / DOOR_SWING[1]);
    indoors = inside ? Math.min(1, indoors + dt / ROOF_FADE) : Math.max(0, indoors - dt / ROOF_FADE);
    if (golden === null && inside && Math.hypot(cabin.golden.x - player.x, cabin.golden.y - 3 - player.y) <= PICKUP_RADIUS) findGolden();
    if (auto && auto.house) recordCabin(near, inside);
  }

  // The &house test hook's record: when each thing first happened (seconds of
  // the round), on <body data-house>.
  function recordCabin(near, inside) {
    const log = auto.house.log;
    const first = (name, happened) => { if (happened && log[name] === undefined) log[name] = +time.toFixed(3); };
    first('near', near);
    first('open', door === 1);
    first('in', inside);
    first('roofOff', indoors === 1);
    first('golden', golden);
    if (log.in !== undefined && log.youGoingIn === undefined) log.youGoingIn = counts.you;
    if (log.out !== undefined && log.youComingOut === undefined) log.youComingOut = counts.you;
    first('out', log.in !== undefined && !inside);
    first('roofOn', log.roofOff !== undefined && indoors === 0);
    first('away', log.near !== undefined && !near);
    first('shut', log.open !== undefined && door === 0);
    log.door = +door.toFixed(3);
    log.indoors = +indoors.toFixed(3);
    log.found = golden === 'you';
    log.you = counts.you;
    log.left = acorns.length;
    log.icon = !el('golden').hidden;
    log.countText = el('acorns').textContent;
    document.body.dataset.house = JSON.stringify(log);
  }

  // The park is empty: show who got what.
  function finish() {
    state = 'over';
    Input.release();
    sound('finish');
    if (duo) {
      finishTogether();
      return;
    }
    el('golden-found').textContent = 'and found the golden acorn!';
    for (const id of ['rivals', 'best', 'again']) el(id).hidden = false;
    el('over-wait').hidden = true;
    el('over-menu').textContent = 'Main menu';
    const mostByRival = Math.max(counts.jays, counts.groundhogs, counts.squirrels);
    el('verdict').textContent = counts.you * 2 >= total ? 'Winter is sorted!'
      : counts.you > mostByRival ? 'Enough to get by' : 'A lean winter...';
    el('result').textContent = `You gathered ${counts.you} of ${total} acorns in ${formatTime(time)}`;
    el('golden-found').hidden = golden !== 'you';
    if (auto && auto.house && auto.house.log.endLine === undefined) auto.house.log.endLine = golden === 'you' ? el('golden-found').textContent : '';
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
    // The end screen repeats the score and time, so the HUD makes way for the About button.
    el('hud').hidden = true;
    el('over').hidden = false;
    el('info').hidden = false;
    el('mute-menu').hidden = false;
    el('again').focus();
    if (auto) {
      document.body.dataset.result = `you=${counts.you} jays=${counts.jays} groundhogs=${counts.groundhogs} squirrels=${counts.squirrels} total=${total} time=${time.toFixed(1)} noclips=${auto.noclips} golden=${golden === 'you' ? 1 : 0} piles=${auto.piles}`;
      if (params.has('restart')) {
        // After this update is over: a round can end part-way through one, and Play again resets the rivals.
        setTimeout(() => {
          el('again').click();
          document.body.dataset.restart = `${el('acorns').textContent} ${state} over-hidden=${el('over').hidden} golden-hidden=${el('golden').hidden}`;
        }, 0);
      }
      auto.speed = 0;
    }
  }

  // ---- update ----

  function nearestAcorn() {
    let nearest = null;
    let nearestDistance = Infinity;
    // The test squirrel, playing others, leaves them the acorns nearer to
    // them, as a person would rather than chase them round the park. As it
    // sees them a moment late, it counts them 16 px nearer than they look.
    const others = auto && duo ? shownOthers() : [];
    const theirs = (acorn) => others.some((other) => Math.hypot(acorn.x - other.x, acorn.y - other.y) < Math.hypot(acorn.x - player.x, acorn.y - player.y) + 16);
    const mineLeft = others.length > 0 && acorns.some((acorn) => !theirs(acorn));
    for (const acorn of acorns) {
      if (mineLeft && theirs(acorn)) continue;
      const distance = Math.hypot(acorn.x - player.x, acorn.y - player.y);
      if (distance < nearestDistance) {
        nearest = acorn;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  // The test squirrel heads for the nearest acorn as the crow flies. When
  // something is in that straight line it takes the way round, as a person
  // would: round the ponds and the mountain, over a bridge.
  function autoVector(dt) {
    if (auto.house && !auto.house.done) return houseVector();
    // &first=ID: the test squirrel makes for that acorn first, while it is there.
    const first = params.has('first') ? acorns.find((acorn) => acorn.id === Number(params.get('first'))) : null;
    const nearest = first || nearestAcorn();
    if (!nearest) return { x: 0, y: 0 };
    const far = (acorn) => Math.hypot(acorn.x - player.x, acorn.y - player.y);
    // While going the long way round it keeps to its acorn unless one is clearly nearer, so it does not dither.
    const detouring = auto.way && auto.way.length > 1;
    if (nearest !== auto.target && (!detouring || !acorns.includes(auto.target) || far(nearest) < far(auto.target) - 16)) {
      const spot = { x: nearest.x, y: nearest.y - 3 };
      auto.target = nearest;
      auto.best = Infinity;
      auto.way = level.clearLine(player, spot) ? [spot] : level.wayTo(player, spot) || [spot];
      auto.leg = 0;
    }
    let goal = auto.way[auto.leg];
    if (auto.leg < auto.way.length - 1 && Math.hypot(goal.x - player.x, goal.y - player.y) < 5) {
      auto.leg++;
      auto.best = Infinity;
      goal = auto.way[auto.leg];
    }
    const distance = Math.hypot(goal.x - player.x, goal.y - player.y) || 0.01;
    // If it stops getting closer for a while, it pushes through the scenery (never through water).
    if (distance < auto.best - 1) {
      auto.best = distance;
      auto.stalled = 0;
    } else {
      auto.stalled += dt;
      if (auto.stalled > 0.5 && auto.noclip <= 0) {
        auto.noclip = 0.6;
        auto.noclips++;
      }
    }
    auto.noclip -= dt;
    return { x: ((goal.x - player.x) / distance) * auto.pace, y: ((goal.y - player.y) / distance) * auto.pace };
  }

  // The &house test hook: first the test squirrel walks to the cabin's
  // doorstep (the way round anything in between), in through the door, to the
  // golden acorn under the table, and out again down the little path.
  function houseVector() {
    const house = auto.house;
    if (!house.way) {
      const step = { x: cabin.door.x, y: cabin.door.y + 14 };
      house.way = (level.clearLine(player, step) ? [step] : level.wayTo(player, step) || [step]).concat([
        { x: cabin.door.x, y: cabin.door.y - 12 },
        { x: cabin.golden.x + 2, y: cabin.golden.y + 6 },
        { x: cabin.door.x, y: cabin.door.y - 12 },
        { x: cabin.door.x, y: cabin.door.y + 20 },
        { x: cabin.door.x + 12, y: cabin.door.y + 52 },
      ]);
      house.leg = 0;
    }
    const goal = house.way[house.leg];
    const distance = Math.hypot(goal.x - player.x, goal.y - player.y);
    if (distance < 2) {
      house.leg++;
      if (house.leg >= house.way.length) house.done = true;
      return { x: 0, y: 0 };
    }
    return { x: ((goal.x - player.x) / distance) * auto.pace, y: ((goal.y - player.y) / distance) * auto.pace };
  }

  // Standing still, the squirrel sniffs out the nearest acorn: it turns to face
  // it just before each round of the idle routine in sprites.js begins.
  function sniffAround() {
    const round = Math.floor((player.idle - Sprites.IDLE_START + TURN_BEFORE_SNIFF) / Sprites.IDLE_CYCLE);
    if (round < 0 || round === player.sniffRound) return;
    player.sniffRound = round;
    const acorn = nearestAcorn();
    if (!acorn) return;
    const dx = acorn.x - player.x;
    const dy = acorn.y - player.y;
    if (Math.abs(dx) > Math.abs(dy)) player.facing = dx < 0 ? 'left' : 'right';
    else player.facing = dy < 0 ? 'up' : 'down';
  }

  function update(dt) {
    if (duo) togetherUpdate(dt);   // talking to the other phones goes on, paused or not
    if (paused) return;   // everything stands still, the clock too
    clock += dt;
    effects.update(dt, clock);
    if (goShown > 0) {
      goShown -= dt;
      if (goShown <= 0) el('countdown').hidden = true;
    }
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 160 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    // A jump for joy plays out even when that acorn was the last and the round is over.
    player.joy = Math.max(0, player.joy - dt);
    if (state !== 'playing') {
      player.moving = false;
      player.idle += dt;
    }
    if (state === 'menu') return;

    // After the round the rivals carry on, so a jay still flies off with its prize.
    rivals.update(dt);
    waterLife.update(dt);
    // A leaf pile bursts when anyone runs into it (1.17): this squirrel, the
    // others in a game with friends, a grey squirrel or a groundhog out of its hole.
    rustles = effects.trample([player, ...shownOthers(), ...rivals.walkers()]).map((pile) => ({ who: {}, kind: 'rustle', x: pile.x, y: pile.y }));
    if (auto && state === 'playing') auto.piles += rustles.length;
    if (sounds.context()) listen(dt);
    if (duo) animateOthers(dt);
    if (state !== 'playing') return;
    if (readyIn > 0) {
      countDown(dt);
      return;
    }

    time += dt;
    const move = auto ? autoVector(dt) : Input.vector();
    player.moving = Boolean(move.x || move.y);
    if (player.moving) {
      player.x += move.x * SPEED * dt;
      player.y += move.y * SPEED * dt;
      player.hop += dt;
      player.idle = 0;
      player.sniffRound = -1;
      if (Math.abs(move.x) > Math.abs(move.y)) player.facing = move.x < 0 ? 'left' : 'right';
      else player.facing = move.y < 0 ? 'up' : 'down';
    } else {
      player.hop = 0;
      player.idle += dt;
      sniffAround();
    }
    level.pushOut(player, PLAYER_RADIUS, !(auto && auto.noclip > 0));
    updateCabin(dt);

    for (const acorn of acorns.slice()) {
      if (Math.hypot(acorn.x - player.x, acorn.y - 3 - player.y) <= PICKUP_RADIUS) takeAcorn(acorn, 'you');
    }
    if (mode === 'explore' && !(duo && duo.role === 'guest')) {
      growAcorns();
      if (auto) reportExplore();
    }
    updateHud();
  }

  // "3, 2, 1, Go!" before a round with friends: nobody moves and the clock
  // waits. The host's phone gives up waiting for the others' after a few
  // seconds, in case a "ready" was lost.
  let goShown = 0;
  function countDown(dt) {
    if (readyIn === Infinity) {
      if (now() - duo.sentRoundAt > COUNTDOWN + 2) readyIn = COUNTDOWN;
      el('countdown').textContent = String(COUNTDOWN);
      el('countdown').hidden = false;
      return;
    }
    readyIn = Math.max(0, readyIn - dt);
    el('countdown').textContent = readyIn > 0 ? String(Math.ceil(readyIn)) : 'Go!';
    el('countdown').hidden = false;
    if (readyIn === 0) {
      goShown = 0.7;
      if (reportsWanted) duo.goAt = Date.now();
    }
  }

  // The Explore test hook: once a second of play, how it is going, on <body data-explore>.
  function reportExplore() {
    auto.fewest = Math.min(auto.fewest, acorns.length);
    auto.most = Math.max(auto.most, acorns.length);
    if (time - auto.reported < 1) return;
    auto.reported = time;
    document.body.dataset.explore = JSON.stringify({
      time: Math.round(time), state, you: counts.you, jays: counts.jays, groundhogs: counts.groundhogs, squirrels: counts.squirrels,
      acorns: acorns.length, fewest: auto.fewest, most: auto.most, grown: auto.grown.length, lastGrown: auto.grown.slice(-3),
    });
  }

  // ---- draw ----

  // Follow the squirrel but stop at the park edge; centre the park if the view is bigger than it.
  function cameraOffset(target, view) {
    if (view >= level.size) return Math.round((level.size - view) / 2);
    return Math.round(Math.min(level.size - view, Math.max(0, target - view / 2)));
  }

  // The part of the park that is on screen, in park pixels. The camera follows
  // the whole pixel the squirrel is drawn on; following its exact position would
  // make it and the background snap to pixels at different moments and judder.
  function cameraView() {
    return { x: cameraOffset(Math.round(player.x), viewW), y: cameraOffset(Math.round(player.y), viewH), w: viewW, h: viewH };
  }

  // The cabin's layers for the depth sort, at (x, y) on screen. With the roof
  // on: the outside, lit by the fire, and the door. With it off: the walls
  // (behind everything inside), the table, the golden acorn under it, and the
  // front sill (in front of everything inside). In between, both, fading.
  function addCabin(things, x, y, lit) {
    const house = cabinArt.house;
    if (indoors < 1) {
      const alpha = indoors > 0 ? 1 - indoors : undefined;
      things.push({ sprite: cabinArt.frames[lit], x, y, depth: cabin.y, alpha });
      things.push({ sprite: cabinArt.doors[Math.round(door * 3)], x: x + house.doorway.x, y: y + house.doorway.y, depth: cabin.y + 0.001, alpha });
    }
    if (indoors > 0) {
      const alpha = indoors < 1 ? indoors : undefined;
      const offX = x + (cabinArt.frames[0].width >> 1) - cabin.x;   // from park pixels to the screen
      const offY = y + cabinArt.frames[0].height - cabin.y;
      things.push({ sprite: cabinArt.insideWalls[lit], x, y, depth: cabin.y - cabin.depth - 0.5, alpha });
      const table = cabinArt.table[lit];
      things.push({ sprite: table, x: offX + cabin.table.x - (table.width >> 1), y: offY + cabin.table.y - table.height, depth: cabin.table.y, alpha });
      if (!golden) {
        const bob = Math.round(Math.sin(clock * 4) * 1.5);
        things.push({ sprite: Sprites.goldenAcorn, x: offX + cabin.golden.x - 4, y: offY + cabin.golden.y - 12 - bob, depth: cabin.golden.y, alpha });
      }
      things.push({ sprite: cabinArt.sill, x, y, depth: cabin.y + 0.002, alpha });
    }
  }

  function draw() {
    const view = cameraView();
    const camX = view.x;
    const camY = view.y;
    ctx.fillStyle = '#2a6e33';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.drawImage(ground, -camX, -camY);
    const still = effects.pondFrame(clock);
    const flowing = Scenery.flowFrame(clock);
    ctx.drawImage(pond.frames[still], pond.x - camX, pond.y - camY);
    ctx.drawImage(brook.frames[flowing], brook.x - camX, brook.y - camY);
    // Fish under the water, faint, with the water's sparkles over them; then
    // rings spreading from splashes and wakes (1.15).
    for (const fish of waterLife.beneath()) {
      ctx.globalAlpha = fish.alpha;
      ctx.drawImage(fish.sprite, fish.x - camX, fish.y - camY);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(pond.surface[still], pond.x - camX, pond.y - camY);
    ctx.drawImage(brook.surface[flowing], brook.x - camX, brook.y - camY);
    // Lily pads, on the water, rocking with the ponds (1.17).
    ctx.drawImage(pond.pads.frames[still], pond.pads.x - camX, pond.pads.y - camY);
    ctx.drawImage(brook.pads.frames[still], brook.pads.x - camX, brook.pads.y - camY);
    for (const ring of waterLife.ripples()) {
      ctx.globalAlpha = ring.alpha;
      ctx.drawImage(ring.sprite, ring.x - camX, ring.y - camY);
    }
    ctx.globalAlpha = 1;
    // The log bridges, over everything on the water (1.16).
    ctx.drawImage(brook.bridges, brook.x - camX, brook.y - camY);
    for (const decal of rivals.decals()) ctx.drawImage(decal.sprite, decal.x - camX, decal.y - camY);
    const lit = Scenery.flicker(clock);
    const cabinLeft = cabin.x - (cabinArt.frames[0].width >> 1) - camX;
    const cabinTop = cabin.y - cabinArt.frames[0].height - camY;
    if (indoors > 0) {
      // The cabin's floor, under everything inside, shadows too.
      ctx.globalAlpha = indoors;
      ctx.drawImage(cabinArt.insideFloor[lit], cabinLeft, cabinTop);
      ctx.globalAlpha = 1;
    }

    const px = Math.round(player.x) - camX;
    const py = Math.round(player.y) - camY;
    ctx.drawImage(Sprites.shadowSmall, px - 5, py - 2);
    const others = shownOthers();
    for (const other of others) ctx.drawImage(Sprites.shadowSmall, Math.round(other.x) - 5 - camX, Math.round(other.y) - 2 - camY);
    for (const acorn of acorns) {
      ctx.drawImage(Sprites.shadowSmall, acorn.x - 5 - camX, acorn.y - 2 - camY);
    }
    for (const spot of rivals.shadows().concat(waterLife.shadows())) {
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
        if (art === cabinArt) {
          addCabin(things, x, y, lit);
          if (indoors >= 0.5) continue;   // the squirrel is inside, in plain view
        } else {
          // The windmill's sails turn with the wind, and a leaf pile shows how long since it burst (1.17).
          const sprite = art.frames.length === 1 ? art.frames[0]
            : art.turns ? art.frames[effects.sails(art.frames.length)]
              : prop.pile !== undefined ? art.frames[effects.pileFrame(prop.pile)]
                : Scenery.frame(art, effects.lean(prop.x, prop.y, clock), clock);
          things.push({ sprite, x, y, depth: prop.y });
        }
        if (art.hides && prop.y > player.y && px > x && px < x + width && py - 8 > y && py - 8 < y + height) {
          behindTree = true;
        }
      }
    }
    for (const acorn of acorns) {
      const bob = Math.round(Math.sin(clock * 4 + acorn.phase) * 1.5);
      things.push({ sprite: Sprites.acorn, x: acorn.x - 4 - camX, y: acorn.y - 12 - bob - camY, depth: acorn.y });
    }
    for (const thing of rivals.things(clock).concat(waterLife.things())) {
      things.push({ sprite: thing.sprite, x: thing.x - camX, y: thing.y - camY, depth: thing.depth, clip: thing.clip });
    }
    for (const other of others) {
      // Another player's squirrel, in its own coat.
      const theirs = coatOf(other.seat)[other.facing];
      const lift = other.joy > 0 ? Sprites.joyLift(other.joy, JOY_HEIGHT) : other.moving ? [0, 1, 2, 1][Math.floor(other.hop * 12) % 4] : 0;
      things.push({
        sprite: other.moving ? theirs.rest : Sprites.idleFrame(theirs, other.idle),
        x: Math.round(other.x) - 8 - camX, y: Math.round(other.y) - 15 - lift - camY, depth: other.y,
      });
    }
    const poses = coatOf(duo ? duo.seat : 0)[player.facing];
    // Only the picture leaves the ground: the camera and the shadow stay with the squirrel itself.
    const hop = player.joy > 0 ? Sprites.joyLift(player.joy, JOY_HEIGHT)
      : player.moving ? [0, 1, 2, 1][Math.floor(player.hop * 12) % 4] : 0;
    const squirrel = {
      sprite: player.moving ? poses.rest : Sprites.idleFrame(poses, player.idle),
      x: px - 8, y: py - 15 - hop, depth: player.y,
    };
    things.push(squirrel);
    things.sort((a, b) => a.depth - b.depth);
    for (const thing of things) {
      if (thing.alpha !== undefined) ctx.globalAlpha = thing.alpha;
      if (thing.clip) {
        // Only the top rows: a groundhog partly out of its hole.
        ctx.drawImage(thing.sprite, 0, 0, thing.sprite.width, thing.clip, thing.x, thing.y, thing.sprite.width, thing.clip);
      } else {
        ctx.drawImage(thing.sprite, thing.x, thing.y);
      }
      ctx.globalAlpha = 1;
    }
    if (behindTree) {
      // Show a faint squirrel through the leaves so the player never loses track of it.
      ctx.globalAlpha = 0.45;
      ctx.drawImage(squirrel.sprite, squirrel.x, squirrel.y);
      ctx.globalAlpha = 1;
    }

    effects.drawLeaves(ctx, camX, camY);
    effects.drawSmoke(ctx, camX, camY, cabin.chimney, clock);
    for (const flyer of rivals.flyers().concat(waterLife.flyers())) ctx.drawImage(flyer.sprite, flyer.x - camX, flyer.y - camY);
    effects.drawClouds(ctx, camX, camY, viewW, viewH);

    for (const particle of particles) {
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x) - camX, Math.round(particle.y) - camY, 1, 1);
    }

    if (state === 'playing' && clock % (ARROW_BLINK[0] + ARROW_BLINK[1]) < ARROW_BLINK[0]) {
      // Blinking arrows on the edge of the view, clear of the HUD and the minimap.
      const safe = { left: 7, top: Math.ceil(hudBottom) + 7, right: viewW - 8, bottom: viewH - 8 };
      for (const arrow of Hud.hintArrows(player, acorns, view, HINT_ARROWS, safe, othersBox ? [minimapBox, othersBox] : [minimapBox])) {
        const sprite = Sprites.arrows[arrow.direction];
        ctx.drawImage(sprite, arrow.x - (sprite.width >> 1), arrow.y - (sprite.height >> 1));
      }
    }
    if (state !== 'menu') {
      const dots = others.map((other) => ({ x: other.x, y: other.y, color: COAT_COLORS[other.seat] }));
      Hud.drawMinimap(minimapCtx, miniature, level, player, view, clock, dots);
    }
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

  // ---- games with friends (1.13; up to four players since 1.14) ----
  //
  // Each phone builds the same park and moves its own squirrel. The host's
  // phone keeps the round: which acorns are left and who took each, the
  // clock, Explore's new acorns, the golden acorn, pausing and the end. Each
  // phone takes an acorn the moment its squirrel reaches it; a guest tells
  // the host when, by its own clock. When two squirrels reach one together it
  // goes to the one that really got there first: the host puts each guest's
  // clock beside its own (from how late its messages come and how long a
  // round trip takes), and the counts are put right on every phone. A round
  // starts with a countdown that ends on every phone together. Each phone
  // sends where its squirrel is twenty times a second; the guests are linked
  // to the host's phone only, so it passes each guest's on to the others.
  // Each phone draws the others a tenth of a second behind, smoothly
  // (Duo.follower). There are no thieves: each phone has its own wildlife
  // for show round its own squirrel, which never touches an acorn. Friends
  // come and go: one who joins part-way through a round starts at the
  // crossing with nothing, and when one leaves the rest play on. The
  // messages are in duo.js; the links, through PeerJS, in net.js.

  const now = () => performance.now() / 1000;
  const COATS = [Sprites.squirrel, Sprites.blackSquirrel, Sprites.whiteSquirrel, Sprites.brownSquirrel];
  const coatOf = (seat) => COATS[seat] || Sprites.squirrel;
  // A player's name, by seat.
  const nameOf = (seat) => (duo && duo.players[seat] && duo.players[seat].name) || 'the other player';
  // "Sam", "Sam and Jo", "Sam, Jo and Mo".
  const inWords = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(''));
  // The seats in this game other than this phone's.
  const otherSeats = () => duo.players.map((someone, seat) => (someone && seat !== duo.seat ? seat : -1)).filter((seat) => seat >= 0);
  // How many acorns the player in `seat` has this round. Seat -1 is someone
  // who has since left the game.
  const haulOf = (seat) => (seat === duo.seat ? counts.you : duo.hauls[seat] || 0);
  function addHaul(seat, n) {
    if (seat === duo.seat) counts.you += n;
    else if (seat >= 0) duo.hauls[seat] += n;
  }

  // The squirrel of the player in `seat`, as drawn on this phone: where it
  // is, how it looks, and the positions its phone has sent (`follow`).
  function otherIn(seat) {
    let other = duo.others.get(seat);
    if (!other) {
      other = { seat, x: 0, y: 0, facing: 'down', moving: false, hop: 0, idle: 0, joy: 0, seen: false, follow: Duo.follower() };
      toStart(other);
      duo.others.set(seat, other);
    }
    return other;
  }

  // Back to its place by the crossing, not yet heard from.
  function toStart(other) {
    Object.assign(other, { x: level.spawn.x + START_SPOTS[other.seat], y: level.spawn.y, facing: 'down', moving: false, hop: 0, idle: 0, joy: 0, seen: false });
    other.follow.clear();
  }

  // The other squirrels on screen: in a round, once their first position has come.
  const shownOthers = () => (duo && duo.inRound ? [...duo.others.values()].filter((other) => other.seen && duo.players[other.seat]) : []);

  // A jump for joy, for whoever's squirrel it is.
  function cheerFor(seat) {
    if (seat === duo.seat) player.joy = Sprites.cheer(player.joy);
    else if (seat >= 0) {
      const other = otherIn(seat);
      other.joy = Sprites.cheer(other.joy);
    }
  }

  // A sound another player makes: faint, and only when it is near.
  function faintly(name, at) {
    const distance = Math.hypot(at.x - player.x, at.y - player.y);
    if (distance < 240) sounds.beep(name, 0.5 * (1 - distance / 240));
  }

  // Who this phone is in a game with friends, and what it knows of the others.
  function newSession(role, name) {
    return {
      role, seat: role === 'host' ? 0 : -1,
      players: [role === 'host' ? { name, here: true } : null, null, null, null],   // each seat's { name, here }, or null
      host: null, guest: null, room: null, code: '',
      inRound: false, round: 0,
      others: new Map(),           // seat -> another player's squirrel, as drawn here (see otherIn)
      hauls: [0, 0, 0, 0],         // the other players' acorns this round, by seat (this phone's is counts.you)
      heardAt: now(), sendIn: 0, waiting: false,      // the guest's: when the host was last heard, and whether it is waited for
      sentView: { w: 0, h: 0 },                       // the guest's: the screen it last told the host about
      links: new Map(),                               // the host's: seat -> what it knows of that phone (see linkOf)
      pause: { seq: 0, by: null, waits: [] },         // how many times pausing has changed, who did it last, whom the host waits for
      hostPause: { on: false, by: null, waits: [] },  // the guest's: the host's pausing, as last heard
      owners: new Map(),           // who took each acorn this round, by seat (-1: someone who has since left)
      claimedAt: new Map(),        // the host's: when (its clock) each acorn's owner reached it
      goldenSeat: null,            // who found the golden acorn this round, by seat
      goldenAt: 0,                 // the host's: when (its clock) they reached it
      readying: null,              // the host's, as a round starts: seat -> round trip of its "ready" (null until it comes)
      sentRoundAt: 0,
      echo: null,                  // the guest's: the host's latest clock reading, and when it came
      overturned: 0,               // acorns this phone took that turned out to be another's
      decisions: [],               // for the test page: the host's close calls, the claimant's time less the owner's
    };
  }

  // What the host knows of the phone in `seat`: when it was last heard and
  // whether it has gone quiet, its screen, how late its messages come and
  // how long a round trip takes.
  function linkOf(seat) {
    let link = duo.links.get(seat);
    if (!link) {
      link = { heardAt: now(), quiet: false, view: { w: VIEW_SHORT * 2, h: VIEW_SHORT }, gaps: [], trips: [] };
      duo.links.set(seat, link);
    }
    return link;
  }

  // ---- hosting and joining ----

  async function hostGame() {
    const name = readName();
    if (!name) return needName();
    if (!auto) sounds.unlock();   // a tap: the moment a phone allows sound to start
    const session = newSession('host', name);
    session.host = Duo.createHost({
      name, version: VERSION,
      onjoin: ({ seat, back }) => duo === session && someoneCame(seat, back),
      onleave: ({ seat, name: theirs, left }) => duo === session && someoneWent(seat, theirs, left),
      onmessage: (seat, message) => duo === session && hostHeard(seat, message),
    });
    duo = session;
    keepAwake(true);
    showDuo('host', 'Opening a game...');
    try {
      const code = auto && params.has('code') ? Net.cleanCode(params.get('code')) : null;
      const room = await Net.openRoom({ code, onlink: (link) => session.host.attach(link) });
      if (duo !== session) {
        room.close();
        return;
      }
      session.room = room;
      session.code = room.code;
      showDuo('host', '');
    } catch (error) {
      if (duo !== session) return;
      endTogether();
      showDuo('choose', error.message, true);
    }
  }

  // A phone joined the host's game, or came back after dropping out. One
  // that joins part-way through a round starts at the crossing with nothing
  // (in the countdown, with everyone); one that comes back takes up where it
  // was; one that joins while the end screen is up waits for the next round.
  function someoneCame(seat, back) {
    duo.players = duo.host.players();
    linkOf(seat).heardAt = now();
    otherIn(seat).follow.clear();
    duo.host.sendLobby();
    if (duo.inRound && (back || state === 'playing')) {
      const fresh = readyIn === Infinity;   // the others' "ready" still awaited: this one's too
      if (fresh && duo.readying && !duo.readying.has(seat)) duo.readying.set(seat, null);
      sendRound(seat, fresh);
    }
    if (duo.inRound) updateHud();
    else showDuo('host', '');
    // The test hook &start (with &players, 2 by default) starts once that many are in.
    if (auto && params.has('start') && !duo.inRound && duo.host.linked().length >= Number(params.get('players') || 2) - 1) {
      startTogether(params.get('start') === 'explore' ? 'explore' : 'race');
    }
  }

  // A phone left the host's game, or lost its link. Before the first round
  // its seat is free again. Once a game is on, one that said goodbye has gone
  // and the rest play on (the game ends if nobody else is left); one whose
  // link dropped keeps its place and is waited for (see watchQuiet).
  function someoneWent(seat, theirs, left) {
    duo.players = duo.host.players();
    if (duo.inRound && left && !otherSeats().length) {
      otherLeft(theirs);
      return;
    }
    if (!duo.players[seat]) {
      forget(seat);
      if (duo.readying && duo.readying.delete(seat)) everyoneReady();
    }
    duo.host.sendLobby();
    if (!duo.inRound) {
      showDuo('host', '');
      return;
    }
    waitForQuiet(false);
    updateHud();
  }

  // The player in `seat` has gone: their squirrel goes, and their acorns come
  // off the scores (the acorns stay taken).
  function forget(seat) {
    duo.others.delete(seat);
    duo.links.delete(seat);
    duo.hauls[seat] = 0;
    for (const [id, owner] of duo.owners) if (owner === seat) duo.owners.set(id, -1);
    if (duo.goldenSeat === seat) duo.goldenSeat = -1;
  }

  async function joinGame(typed) {
    const name = readName();
    if (!name) return needName();
    const code = Net.cleanCode(typed);
    if (code.length !== Net.CODE_LENGTH) {
      showDuo('join', `A code has ${Net.CODE_LENGTH} letters.`, true);
      return;
    }
    if (!auto) sounds.unlock();
    const session = newSession('guest', name);
    session.code = code;
    session.guest = Duo.createGuest({
      name, token: tabToken(), version: VERSION, connect: () => Net.joinRoom(code),
      onmessage: (message) => duo === session && guestHeard(message),
      onlink: () => duo === session && !session.inRound && showDuo('join', ''),
    });
    duo = session;
    keepAwake(true);
    showDuo('join', 'Connecting...');
    try {
      await session.guest.join();
    } catch (error) {
      if (duo !== session) return;
      endTogether();
      showDuo('join', error.message, true);
      return;
    }
    if (duo === session && !session.inRound) showDuo('join', '');
  }

  // ---- a round ----

  // The host starts a round for every phone linked.
  function startTogether(newMode) {
    if (!duo || duo.role !== 'host') return;
    const linked = duo.host.linked();
    if (!linked.length) return;
    duo.round++;
    duo.inRound = true;
    duo.host.setStarted(true);
    duo.owners.clear();
    duo.claimedAt.clear();
    duo.goldenSeat = null;
    duo.pause = { seq: duo.pause.seq + 1, by: null, waits: [] };
    for (const link of duo.links.values()) {
      link.heardAt = now();
      link.quiet = false;
    }
    start(newMode);
    // Each phone starts its countdown when the round reaches it, and says so.
    // The host's waits for them all, then runs for what is left of theirs:
    // COUNTDOWN less half the round trip, on average.
    readyIn = Infinity;
    duo.sentRoundAt = now();
    duo.readying = new Map(linked.map((seat) => [seat, null]));
    for (const seat of linked) sendRound(seat, true);
  }

  // Every "ready" the host was waiting for is in.
  function everyoneReady() {
    if (readyIn !== Infinity || !duo.readying) return;
    const trips = [...duo.readying.values()];
    if (!trips.length || trips.includes(null)) return;
    const trip = trips.reduce((sum, each) => sum + each, 0) / trips.length;
    readyIn = Math.max(0, COUNTDOWN + trip / 2 - (now() - duo.sentRoundAt));
  }

  // How the round stands, for the phone in `seat`: at the start, when it
  // joins part-way through, and whenever it comes back after dropping out.
  // `fresh`: it is to count down with the rest and say when it is ready.
  function sendRound(seat, fresh) {
    const other = otherIn(seat);
    duo.host.sendTo(seat, {
      t: 'round', n: duo.round, fresh, mode, time: +time.toFixed(2), over: state === 'over', seat,
      acorns: acorns.map((acorn) => [acorn.id, acorn.x, acorn.y]),
      owners: [...duo.owners],
      hauls: duo.players.map((someone, seat) => (someone ? haulOf(seat) : 0)),
      golden: duo.goldenSeat,
      paused, by: duo.pause.by, waits: duo.pause.waits, seq: duo.pause.seq,
      at: { x: Math.round(other.x), y: Math.round(other.y) },
      players: duo.players,
      countdown: readyIn === Infinity ? COUNTDOWN : readyIn,
    });
  }

  // The guest takes the round as the host has it. A new one starts afresh
  // (counting down with the rest if it has not begun); for the one already
  // under way (this phone dropped out and is back) only the acorns, the
  // counts, the clock and the pausing are brought up to date.
  function joinRound(message) {
    const fresh = message.n !== duo.round;
    duo.round = message.n;
    if (Number.isInteger(message.seat)) duo.seat = message.seat;
    applyRoster(message.players);
    duo.inRound = true;
    duo.waiting = false;
    if (fresh || state === 'menu') {
      start(message.mode);
      if (!message.fresh) {
        player.x = message.at.x;
        player.y = message.at.y;
      }
      readyIn = message.countdown || 0;
      if (readyIn) duo.guest.send({ t: 'ready' });
    }
    acorns = message.acorns.map(([id, x, y]) => ({ id, x, y, phase: id, claimedBy: null, gone: false }));
    nextPhase = acorns.reduce((most, acorn) => Math.max(most, acorn.id + 1), nextPhase);
    duo.owners = new Map(message.owners);
    setHauls(message.hauls);
    duo.goldenSeat = typeof message.golden === 'number' ? message.golden : null;
    golden = duo.goldenSeat === null ? null : duo.goldenSeat === duo.seat ? 'you' : 'friend';
    el('golden').hidden = golden !== 'you';
    time = message.time;
    for (const other of duo.others.values()) other.follow.clear();
    duo.pause.seq = message.seq;
    duo.hostPause = { on: message.paused, by: message.by, waits: Array.isArray(message.waits) ? message.waits : [] };
    showHostPause();
    if (message.over && state === 'playing') finish();
    updateHud();
    measureHud();
  }

  // Everyone's acorns, by seat, as the host has them.
  function setHauls(hauls) {
    if (!Array.isArray(hauls)) return;
    hauls.forEach((haul, seat) => {
      if (typeof haul !== 'number') return;
      if (seat === duo.seat) counts.you = haul;
      else duo.hauls[seat] = haul;
    });
  }

  // Who is in the game, as the host says. A seat that has emptied is
  // forgotten: that player has gone, and the rest play on.
  function applyRoster(players) {
    if (!Array.isArray(players)) return;
    const before = duo.players;
    duo.players = [0, 1, 2, 3].map((seat) => {
      const someone = players[seat];
      return someone && typeof someone.name === 'string' ? { name: Duo.cleanName(someone.name) || '?', here: Boolean(someone.here) } : null;
    });
    before.forEach((someone, seat) => {
      if (someone && !duo.players[seat] && seat !== duo.seat) forget(seat);
    });
    hudShown = '';   // the counts are drawn afresh, names and all
  }

  // Where this phone's squirrel is, for the others; the host's also says how
  // the round stands: its clock and its pausing.
  function sendPosition() {
    const spot = { s: +now().toFixed(3), x: +player.x.toFixed(1), y: +player.y.toFixed(1), f: player.facing, m: player.moving && !paused ? 1 : 0 };
    if (duo.role === 'host') {
      const waits = duo.pause.by === 'w' ? { w: duo.pause.waits } : {};
      duo.host.send(Object.assign({ t: 'tick', time: +time.toFixed(2), p: paused ? 1 : 0, b: duo.pause.by, q: duo.pause.seq }, waits, spot));
    } else {
      const echo = duo.echo ? { e: duo.echo.s, h: +(now() - duo.echo.at).toFixed(3) } : {};
      duo.guest.send(Object.assign({ t: 'me' }, spot, echo));
    }
  }

  // Every update, paused or not: send this phone's squirrel when it is time,
  // wait for any phone that has gone quiet, and place the other squirrels.
  function togetherUpdate(dt) {
    if (!duo.inRound) return;
    const at = now();
    duo.sendIn -= dt;
    if (duo.sendIn <= 0) {
      duo.sendIn = Math.max(0, duo.sendIn) + SEND_EVERY;
      sendPosition();
      if (duo.role === 'guest' && (duo.sentView.w !== viewW || duo.sentView.h !== viewH) && duo.guest.send({ t: 'view', w: viewW, h: viewH })) {
        duo.sentView = { w: viewW, h: viewH };
      }
    }
    if (duo.role === 'host') watchQuiet(at);
    else if (state === 'playing' && !duo.waiting && at - duo.heardAt > QUIET) {
      duo.waiting = true;
      pauseHere('waiting', [0]);
    }
    for (const other of duo.others.values()) placeOther(other, at, dt);
  }

  // A late message can move where another squirrel should be: it catches up
  // a little at a time, faster than it runs, rather than jumping; from far
  // off (back after a drop) it goes straight there.
  function placeOther(other, at, dt) {
    const spot = other.follow.at(at);
    if (!spot) return;
    const dx = spot.x - other.x;
    const dy = spot.y - other.y;
    const away = Math.hypot(dx, dy);
    const most = SPEED * 2.5 * dt + 0.5;
    const step = !other.seen || away > 48 || away <= most ? 1 : most / away;
    // For the test page: the furthest any other squirrel moved in one update.
    if (reportsWanted && other.seen) friendMoved.most = Math.max(friendMoved.most, away * step);
    other.x += dx * step;
    other.y += dy * step;
    other.facing = spot.facing;
    other.moving = spot.moving && !paused;
    other.seen = true;
  }

  function animateOthers(dt) {
    for (const other of duo.others.values()) {
      other.joy = Math.max(0, other.joy - dt);
      if (other.moving) {
        other.hop += dt;
        other.idle = 0;
      } else {
        other.hop = 0;
        other.idle += dt;
      }
    }
  }

  // The part of the park on the screen of the phone in `seat`, as near as
  // the host can tell: it sees that squirrel a moment late, so with a little
  // more all round, for how far it may have run since.
  function friendView(seat) {
    const other = otherIn(seat);
    const { w, h } = linkOf(seat).view;
    const late = 24;
    return { x: cameraOffset(Math.round(other.x), w) - late, y: cameraOffset(Math.round(other.y), h) - late, w: w + 2 * late, h: h + 2 * late };
  }

  // ---- what the host hears ----

  function hostHeard(seat, message) {
    const link = linkOf(seat);
    link.heardAt = now();
    if (link.quiet) {
      // This phone has come back after going quiet.
      link.quiet = false;
      waitForQuiet(false);
    }
    if (message.t === 'me') {
      otherIn(seat).follow.push(message, now());
      timeLink(link, message);
      // The guests are linked to the host only: it passes the position on to the rest.
      duo.host.sendOthers(seat, { t: 'pos', seat, s: message.s, x: message.x, y: message.y, f: message.facing, m: message.moving ? 1 : 0 });
      return;
    }
    if (message.t === 'view') {
      link.view = { w: message.w, h: message.h };
      return;
    }
    if (!duo.inRound) return;
    if (message.t === 'took') {
      guestTook(seat, message);
    } else if (message.t === 'golden') {
      guestFoundGolden(seat, message.s);
    } else if (message.t === 'ready') {
      if (readyIn === Infinity && duo.readying && duo.readying.get(seat) === null) {
        duo.readying.set(seat, now() - duo.sentRoundAt);
        everyoneReady();
      }
    } else if (message.t === 'pause') {
      if (state === 'playing') setPause(true, seat);
    } else if (message.t === 'resume') {
      if (paused) setPause(false, null);
    }
  }

  // How late a guest's messages come and how long a round trip takes, from
  // its last forty positions: so the host can put that phone's clock beside
  // its own, and tell which squirrel reached an acorn first.
  function timeLink(link, message) {
    const { gaps, trips } = link;
    gaps.push(now() - message.s);
    if (gaps.length > 40) gaps.shift();
    if (message.e !== undefined) {
      trips.push(now() - message.e - message.h);
      if (trips.length > 40) trips.shift();
    }
  }

  // When (by the host's clock) the squirrel in `seat` reached something it
  // says it reached at `s`, by its own clock: that clock is put beside the
  // host's from the quickest of its recent messages, less half the quickest
  // round trip (messages are taken to be as quick each way). With no timing
  // yet, when the news came: as late as it can have been, so whoever already
  // has the thing keeps it.
  function reachedAt(seat, s) {
    const { gaps, trips } = linkOf(seat);
    if (typeof s !== 'number' || !gaps.length || !trips.length) return now();
    return s + Math.min(...gaps) - Math.max(0, Math.min(...trips)) / 2;
  }

  // Whether a squirrel that got there at `at` beat one that got there at
  // `ownerAt` (both by the host's clock).
  function earlier(at, ownerAt) {
    if (reportsWanted) duo.decisions.push(+(at - ownerAt).toFixed(3));
    return typeof ownerAt === 'number' && at < ownerAt;
  }

  // A guest's squirrel took an acorn. The first news of it decides, unless
  // news from another squirrel shows that one got there earlier: then it is
  // that one's, and the counts are put right on every phone.
  function guestTook(seat, { id, s }) {
    const at = reachedAt(seat, s);
    const acorn = acorns.find((each) => each.id === id);
    if (acorn && state === 'playing') {
      takeAcorn(acorn, 'friend', seat);   // which tells everyone whose it is
      duo.claimedAt.set(id, at);
      return;
    }
    const owner = duo.owners.has(id) ? duo.owners.get(id) : -1;
    if (duo.owners.has(id) && owner !== seat && earlier(at, duo.claimedAt.get(id))) {
      duo.owners.set(id, seat);
      duo.claimedAt.set(id, at);
      if (owner === duo.seat) duo.overturned++;
      addHaul(owner, -1);
      addHaul(seat, 1);
      cheerFor(seat);
      updateHud();
      duo.host.send({ t: 'taken', id, by: seat });
      if (state === 'over') finishTogether();   // the result changed
    } else {
      duo.host.sendTo(seat, { t: 'taken', id, by: owner });
    }
  }

  // A guest's squirrel found the golden acorn: the same, for the golden acorn.
  function guestFoundGolden(seat, s) {
    const at = reachedAt(seat, s);
    if (duo.goldenSeat === null || (duo.goldenSeat !== seat && earlier(at, duo.goldenAt))) {
      duo.goldenAt = at;
      friendFoundGolden(seat);
      duo.host.send({ t: 'golden', by: seat });
      if (state === 'over') finishTogether();
    } else {
      duo.host.sendTo(seat, { t: 'golden', by: duo.goldenSeat });
    }
  }

  // The host pauses or resumes every phone; `by` is who asked (a seat), or
  // 'w' for the host's phone waiting for the quiet ones (`waits`, by seat).
  function setPause(on, by, waits = []) {
    duo.pause = { seq: duo.pause.seq + 1, by: on ? by : null, waits: on && by === 'w' ? waits : [] };
    if (on) pauseHere(by === 0 ? 'you' : by === 'w' ? 'waiting' : by, waits);
    else resumeHere();
    sendPosition();   // the others hear at once
  }

  // The host waits for any phone that has gone quiet (its link lost, say),
  // and goes on once every one has been heard again (see hostHeard).
  function watchQuiet(at) {
    if (state !== 'playing') return;
    let newly = false;
    for (const [seat, link] of duo.links) {
      if (duo.players[seat] && !link.quiet && at - link.heardAt > QUIET) {
        link.quiet = true;
        newly = true;
      }
    }
    if (newly) waitForQuiet(true);
  }

  // Pausing for the quiet phones: begun when one goes quiet (unless already
  // paused), brought up to date as the list changes, over when none is left.
  // Resume plays on without them.
  function waitForQuiet(newly) {
    const waits = [...duo.links].filter(([seat, link]) => link.quiet && duo.players[seat]).map(([seat]) => seat).sort((a, b) => a - b);
    if (paused && duo.pause.by === 'w') {
      if (!waits.length) setPause(false, null);
      else if (waits.join() !== duo.pause.waits.join()) setPause(true, 'w', waits);
    } else if (newly && waits.length && !paused) setPause(true, 'w', waits);
  }

  // ---- what a guest hears ----

  function guestHeard(message) {
    duo.heardAt = now();
    if (duo.waiting) {
      duo.waiting = false;
      showHostPause();
    }
    if (message.t === 'lobby') {
      if (Number.isInteger(message.seat)) duo.seat = message.seat;
      applyRoster(message.players);
      if (!duo.inRound) showDuo('join', '');
      return;
    }
    if (message.t === 'round') {
      joinRound(message);
      return;
    }
    if (message.t === 'closed' || message.t === 'denied') {
      const said = message.t === 'closed' ? `${duo.players[0] ? duo.players[0].name : 'The other player'} ended the game.` : Duo.deniedText(message, VERSION);
      endTogether();
      toMenu();
      showDuo('ended', said, true);
      return;
    }
    if (!duo.inRound) return;
    if (message.t === 'tick') {
      const spot = Duo.cleanSpot(message);
      if (spot) otherIn(0).follow.push(spot, now());
      duo.echo = { s: message.s, at: now() };
      if (state === 'playing' && typeof message.time === 'number') time = message.time;
      if (message.q !== duo.pause.seq) {
        duo.pause.seq = message.q;
        duo.hostPause = { on: Boolean(message.p), by: message.b, waits: Array.isArray(message.w) ? message.w : [] };
        showHostPause();
      }
    } else if (message.t === 'pos') {
      // Another guest's squirrel, passed on by the host.
      const spot = Duo.cleanSpot(message);
      if (spot && message.seat !== duo.seat && duo.players[message.seat]) otherIn(message.seat).follow.push(spot, now());
    } else if (message.t === 'taken') {
      tookHere(message);
    } else if (message.t === 'grown') {
      if (!acorns.some((acorn) => acorn.id === message.id)) acorns.push({ id: message.id, x: message.x, y: message.y, phase: nextPhase++, claimedBy: null, gone: false });
      updateHud();
    } else if (message.t === 'golden') {
      goldenHere(message.by);
    } else if (message.t === 'end') {
      setHauls(message.hauls);
      time = message.time;
      if (state === 'playing') finish();
      else if (state === 'over') finishTogether();   // the host put the result right
    }
  }

  // The host's pausing, on a guest's phone. While the host waits for this
  // phone, it shows a plain pause.
  function showHostPause() {
    if (duo.waiting) return;
    const { on, by, waits } = duo.hostPause;
    if (!on) {
      if (paused) resumeHere();
    } else if (by === 'w') {
      const others = waits.filter((seat) => seat !== duo.seat);
      if (others.length) pauseHere('waiting', others);
      else pauseHere('you');
    } else pauseHere(by === duo.seat ? 'you' : by);
  }

  // The host says who took an acorn. If this phone had it down otherwise (it
  // took it itself, or the host changed its mind), one count goes over.
  function tookHere({ id, by }) {
    if (typeof by !== 'number') return;
    const before = duo.owners.get(id);
    if (before === undefined) {
      const acorn = acorns.find((each) => each.id === id);
      if (acorn) takeAcorn(acorn, by === duo.seat ? 'you' : 'friend', by);
      duo.owners.set(id, by);
      return;
    }
    if (before === by) return;
    duo.owners.set(id, by);
    if (before === duo.seat) duo.overturned++;
    addHaul(before, -1);
    addHaul(by, 1);
    cheerFor(by);
    updateHud();
    if (state === 'over') finishTogether();
  }

  // The host says who has the golden acorn.
  function goldenHere(by) {
    if (typeof by !== 'number') return;
    if (by === duo.seat) {
      if (golden === 'you') return;
      golden = 'you';
      duo.goldenSeat = by;
      el('golden').hidden = false;
      measureHud();
    } else {
      if (golden === 'friend' && duo.goldenSeat === by) return;
      friendFoundGolden(by);
    }
    if (state === 'over') finishTogether();
  }

  // ---- telling the others ----

  // An acorn taken on this phone: the host says whose it is; a guest says it
  // took it, and counts it as its own until the host says otherwise.
  function tellTaken(acorn, who, seat) {
    if (duo.role === 'host') {
      const by = who === 'you' ? 0 : seat;
      duo.owners.set(acorn.id, by);
      if (by === 0) duo.claimedAt.set(acorn.id, now());
      duo.host.send({ t: 'taken', id: acorn.id, by });
    } else if (who === 'you') {
      duo.owners.set(acorn.id, duo.seat);
      duo.guest.send({ t: 'took', id: acorn.id, s: +now().toFixed(3) });
    }
  }

  function tellGolden() {
    duo.goldenSeat = duo.seat;
    if (duo.role === 'host') {
      duo.goldenAt = now();
      duo.host.send({ t: 'golden', by: 0 });
    } else duo.guest.send({ t: 'golden', s: +now().toFixed(3) });
  }

  // Another player found the golden acorn (first, as far as is known yet).
  function friendFoundGolden(seat) {
    const sparkled = golden !== null;   // its sparkle has been seen here already
    golden = 'friend';
    duo.goldenSeat = seat;
    el('golden').hidden = true;
    measureHud();
    cheerFor(seat);
    if (!sparkled) {
      burst(cabin.golden, '#ffe066', 46);
      faintly('golden', cabin.golden);
    }
  }

  // ---- the end, and leaving ----

  function finishTogether() {
    const seats = [duo.seat, ...otherSeats()];
    const most = Math.max(...seats.map(haulOf));
    const leaders = seats.filter((seat) => haulOf(seat) === most);
    el('verdict').textContent = leaders.length > 1 ? 'A draw!' : leaders[0] === duo.seat ? 'You win!' : `${nameOf(leaders[0])} wins!`;
    // The others from most to fewest: "You gathered 12 and Sam 10", or "You gathered 12, Jo 14 and Sam 10".
    const others = otherSeats().sort((a, b) => haulOf(b) - haulOf(a) || a - b).map((seat) => `${nameOf(seat)} ${haulOf(seat)}`);
    el('result').textContent = `You gathered ${counts.you}${others.length > 1 ? ', ' : others.length ? ' and ' : ''}${inWords(others)}, in ${formatTime(time)}`;
    el('golden-found').textContent = golden === 'you' ? 'and you found the golden acorn!' : `${nameOf(duo.goldenSeat)} found the golden acorn.`;
    // (Not said of someone who has since left.)
    el('golden-found').hidden = golden === null || (golden === 'friend' && !duo.players[duo.goldenSeat]);
    for (const id of ['rivals', 'best']) el(id).hidden = true;
    el('again').hidden = duo.role !== 'host';
    el('over-wait').textContent = `Waiting for ${nameOf(0)} to start another round.`;
    el('over-wait').hidden = duo.role === 'host';
    el('over-menu').textContent = 'Leave game';
    el('hud').hidden = true;
    el('over').hidden = false;
    el('info').hidden = false;
    el('mute-menu').hidden = false;
    el(duo.role === 'host' ? 'again' : 'over-menu').focus();
    if (duo.role === 'host') duo.host.send({ t: 'end', hauls: duo.players.map((someone, seat) => (someone ? haulOf(seat) : 0)), time: +time.toFixed(2) });
    if (auto) {
      const theirs = otherSeats().reduce((sum, seat) => sum + haulOf(seat), 0);
      document.body.dataset.result = `you=${counts.you} friend=${theirs} total=${total} time=${time.toFixed(1)} golden=${golden === 'you' ? 1 : golden === 'friend' ? 2 : 0}`;
    }
  }

  // Leave game: the others are told, and this phone goes back to the start.
  function leaveTogether() {
    if (!duo) return;
    if (duo.role === 'host') duo.host.close('ended');
    else duo.guest.leave();
    endTogether();
    toMenu();
  }

  // This phone's part in the game with friends is over. The host's room
  // stays open a moment, so that its last word ("closed") reaches the others.
  function endTogether() {
    if (!duo) return;
    const was = duo;
    duo = null;
    if (was.room) setTimeout(() => was.room.close(), 1000);
    if (was.guest) was.guest.stop();
    keepAwake(false);
    hudShown = '';
  }

  // The last of the others said goodbye part-way through a game.
  function otherLeft(name) {
    duo.host.close('ended');
    endTogether();
    toMenu();
    showDuo('ended', `${name} left the game.`, true);
  }

  // The screen stays on during a game with friends, as a phone that sleeps
  // drops out. The browser lets the lock go whenever the page is hidden, so
  // it is asked for again each time the page comes back (WordGridGame's way).
  let wakeLock = null;
  let askingLock = false;
  async function keepAwake(on) {
    if (!on) {
      const lock = wakeLock;
      wakeLock = null;
      if (lock) lock.release().catch(() => {});
      return;
    }
    if (wakeLock || askingLock || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    askingLock = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (duo) {
        wakeLock = lock;
        lock.addEventListener('release', () => {
          if (wakeLock === lock) wakeLock = null;
        });
      } else lock.release().catch(() => {});
    } catch (error) {
      // Refused (on low battery, say): the game goes on without it.
    }
    askingLock = false;
  }

  // ---- the Play with friends panel ----

  let duoBox = 'choose';   // what it shows: 'choose', 'host', 'join' or 'ended'

  function showDuo(kind = duoBox, note = null, warn = false) {
    duoBox = kind;
    if (note !== null) {
      el('duo-status').textContent = note;
      el('duo-status').classList.toggle('warn', warn);
    }
    el('start').hidden = true;
    el('duo').hidden = false;
    const hosting = kind === 'host' && duo && duo.role === 'host';
    const joined = kind === 'join' && duo && duo.role === 'guest' && duo.guest.connected;
    el('duo-choose').hidden = kind !== 'choose';
    el('duo-name-row').hidden = !(kind === 'choose' || (kind === 'join' && !duo));
    el('duo-hosting').hidden = !hosting;
    el('duo-starting').hidden = !hosting;
    el('duo-joining').hidden = !(kind === 'join' && !duo);
    el('duo-players').hidden = !(hosting || joined);
    if (hosting || joined) showPlayers();
    if (hosting) {
      el('duo-code').textContent = duo.code || '....';
      el('duo-share').hidden = !duo.code;
      const friends = duo.players.filter((someone, seat) => seat > 0 && someone && someone.here).length;
      el('duo-friend').textContent = !friends ? 'Waiting for friends to join...'
        : friends < Duo.MAX_PLAYERS - 1 ? 'Choose a game, or wait for more to join.' : 'Four players: the game is full. Choose a game:';
      el('duo-race').disabled = !friends;
      el('duo-explore').disabled = !friends;
    }
    if (joined) {
      el('duo-status').textContent = `Connected to ${nameOf(0)}'s game. Waiting for them to choose a game.`;
      el('duo-status').classList.remove('warn');
    }
  }

  // Who is in the game, each beside a head in their squirrel's colour, so
  // everyone knows which is theirs before the start.
  function showPlayers() {
    const list = el('duo-players');
    list.textContent = '';
    duo.players.forEach((someone, seat) => {
      if (!someone) return;
      const item = document.createElement('li');
      item.innerHTML = headPicture(seat);
      item.append(seat === duo.seat ? `${someone.name} (you)` : someone.name);
      item.classList.toggle('away', !someone.here);
      list.append(item);
    });
  }

  function closeDuo() {
    if (duo) {
      leaveTogether();   // back to the start screen
    } else {
      el('duo').hidden = true;
      el('start').hidden = false;
      el('two').focus();
    }
    el('duo-status').textContent = '';
  }

  // The name each player types, remembered on the phone.
  function readName() {
    const name = Duo.cleanName(el('duo-name').value);
    el('duo-name').value = name;
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch (error) {
      // Private browsing: it is typed again next time.
    }
    return name;
  }

  function needName() {
    el('duo-name').classList.add('want');
    el('duo-name').focus();
    showDuo(duoBox, 'Type your name first: the others see it.', true);
  }

  // The host knows this tab again by its token, which lasts as long as the
  // tab. (A test squirrel's page keeps its own: the test page's frames share
  // one tab's storage.)
  let spareToken = '';
  function tabToken() {
    const fresh = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    if (!auto) {
      try {
        let token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) {
          token = fresh();
          sessionStorage.setItem(TOKEN_KEY, token);
        }
        return token;
      } catch (error) {
        // Storage refused: the page's own, below.
      }
    }
    if (!spareToken) spareToken = fresh();
    return spareToken;
  }

  // The address that opens this game's Join panel, sent with the phone's own
  // Share sheet, or else copied.
  async function shareLink() {
    if (!duo || duo.role !== 'host' || !duo.code) return;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('join', duo.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Squirrel Game', text: `Race me in Squirrel Game: the code is ${duo.code}.`, url: url.href });
      } else {
        await navigator.clipboard.writeText(url.href);
        showDuo('host', 'Link copied. Paste it into a message to your friends.');
      }
    } catch (error) {
      if (!error || error.name !== 'AbortError') showDuo('host', url.href);
    }
  }

  // ---- for the test page (local-tests/two.html) ----

  // How things stand on this phone, sent up to the page holding it.
  const friendMoved = { most: 0 };
  function reportTogether() {
    if (window.parent === window) return;
    const others = {};
    for (const other of shownOthers()) others[other.seat] = { x: +other.x.toFixed(1), y: +other.y.toFixed(1) };
    const first = Number(params.get('first'));
    window.parent.postMessage({
      duoReport: {
        role: duo ? duo.role : null, seat: duo ? duo.seat : null, code: duo ? duo.code : '', at: Date.now(), state, mode, paused, time: +time.toFixed(2),
        me: { x: +player.x.toFixed(1), y: +player.y.toFixed(1) },
        others,
        jump: +friendMoved.most.toFixed(2),
        acorns: acorns.map((acorn) => acorn.id).sort((a, b) => a - b),
        grown: acorns.filter((acorn) => acorn.id >= total).map((acorn) => [acorn.id, acorn.x, acorn.y]),
        hauls: duo ? duo.players.map((someone, seat) => (someone ? haulOf(seat) : null)) : [],
        golden: !duo || golden === null ? null : golden === 'you' ? duo.seat : duo.goldenSeat,
        inRound: Boolean(duo && duo.inRound),
        round: duo ? duo.round : 0, players: duo ? duo.players.map((someone) => someone && someone.name) : null,
        overturned: duo ? duo.overturned : 0, decisions: duo ? duo.decisions.slice(-30) : [],
        // Who has the &first acorn, and when (Date.now()) this squirrel really reached it, if it did.
        firstOwner: duo && params.has('first') && duo.owners.has(first) ? duo.owners.get(first) : null,
        firstAt: auto.firstAt || null,
        owners: duo ? [...duo.owners].sort((a, b) => a[0] - b[0]) : [],
        goAt: duo ? duo.goAt || null : null,   // when (Date.now()) it said Go
        status: el('duo-status').textContent, pausedBy: el('paused').hidden ? null : el('paused-by').textContent,
        result: state === 'over' ? `${el('verdict').textContent} / ${el('result').textContent} / ${el('golden-found').hidden ? '' : el('golden-found').textContent}` : null,
        hud: el('acorns').textContent + (el('others').hidden ? '' : ` | ${el('others').textContent}`),
        heads: el('hud').querySelectorAll('.head').length,
        hudFits: el('hud-row').scrollWidth <= el('hud-row').clientWidth + 1,
        // The others' counts, with three or four players: clear of the map, and inside the window.
        othersFit: el('others').hidden || (el('others').getBoundingClientRect().right <= minimap.getBoundingClientRect().left - 4
          && el('others').getBoundingClientRect().top >= el('hud-row').getBoundingClientRect().bottom),
        view: cameraView(),
      },
    }, '*');
    friendMoved.most = 0;
  }

  // ---- setup ----

  el('help').textContent = window.matchMedia('(pointer: coarse)').matches
    ? 'Drag anywhere on the screen to move.'
    : 'Move with WASD or the arrow keys, or drag with the mouse.';
  el('play').addEventListener('click', () => { sounds.unlock(); start('race'); });
  el('explore').addEventListener('click', () => { sounds.unlock(); start('explore'); });
  el('again').addEventListener('click', () => {
    sounds.unlock();
    if (duo) startTogether(mode);
    else start('race');
  });

  // ---- pause, help, and back to the start ----

  // Everything stops (the squirrel, the animals, the clock, the sounds) under
  // a menu. In a game with friends every phone pauses, whichever asked.
  function pause() {
    if (state !== 'playing' || paused) return;
    if (duo && duo.role === 'host') setPause(true, 0);
    else if (duo) {
      pauseHere('you');
      duo.guest.send({ t: 'pause' });
    } else pauseHere('you');
  }

  function resume() {
    if (!paused) return;
    if (duo && duo.role === 'host') setPause(false, null);
    else if (duo) {
      resumeHere();
      duo.guest.send({ t: 'resume' });
    } else resumeHere();
  }

  // The pause menu, and who it was: 'you', another player (by seat), or
  // 'waiting' (for the phones in `waits`, by seat, which have gone quiet).
  function pauseHere(by, waits = []) {
    const wasPaused = paused;
    paused = true;
    Input.release();
    sounds.pause();
    el('paused-by').textContent = typeof by === 'number' ? `Paused by ${nameOf(by)}` : by === 'waiting' ? `Waiting for ${inWords(waits.map(nameOf))}...` : '';
    el('paused-by').hidden = !el('paused-by').textContent;
    el('restart').hidden = Boolean(duo);
    el('to-menu').textContent = duo ? 'Leave game' : 'Main menu';
    if (el('rules').hidden) el('paused').hidden = false;
    if (!wasPaused) el('resume').focus();
  }

  function resumeHere() {
    paused = false;
    for (const panel of ['paused', 'rules']) el(panel).hidden = true;
    if (!document.hidden) sounds.resume();
    // The phones' clocks stood still for different lengths of time.
    if (duo) for (const other of duo.others.values()) other.follow.clear();
  }

  // Back to the start screen, to choose the race or Explore again.
  function toMenu() {
    state = 'menu';
    paused = false;
    growing = [];
    acorns = [];
    particles = [];
    rivals.reset();
    Input.release();
    sounds.pause();   // quiet behind the start screen; the next round brings the park's sounds back
    for (const panel of ['over', 'paused', 'rules', 'about', 'hud', 'duo', 'countdown']) el(panel).hidden = true;
    el('start').hidden = false;
    el('info').hidden = false;
    el('mute-menu').hidden = false;
    el('play').focus();
  }

  // The help panel opens over the start screen or the pause menu, and closes back to it.
  function showHelp(from) {
    helpFrom = from;
    el(from).hidden = true;
    el('rules').hidden = false;
    // Focus the Close button for the keyboard, but read from the top: focusing scrolls to it otherwise.
    el('close-rules').focus({ preventScroll: true });
    el('rules').scrollTop = 0;
  }

  function closeHelp() {
    el('rules').hidden = true;
    el(helpFrom).hidden = false;
    el(helpFrom === 'paused' ? 'resume' : 'howto').focus();
  }

  el('pause').innerHTML = pausePicture();
  el('golden').innerHTML = `<img src="${Sprites.goldenAcorn.toDataURL()}" alt="">`;
  el('pause').addEventListener('click', pause);
  el('resume').addEventListener('click', resume);
  el('restart').addEventListener('click', () => start());
  el('to-menu').addEventListener('click', () => (duo ? leaveTogether() : toMenu()));
  el('over-menu').addEventListener('click', () => (duo ? leaveTogether() : toMenu()));
  el('howto').addEventListener('click', () => showHelp('start'));
  el('help-from-pause').addEventListener('click', () => showHelp('paused'));
  el('close-rules').addEventListener('click', closeHelp);
  sounds.setOn(readSoundChoice());
  for (const id of ['mute', 'mute-menu']) {
    el(id).innerHTML = speakerPicture();
    el(id).addEventListener('click', () => {
      sounds.setOn(!sounds.isOn());
      saveSoundChoice(sounds.isOn());
      showSoundChoice();
    });
  }
  showSoundChoice();
  // A hidden page (another tab, another app) goes quiet until it comes back;
  // a round in play pauses itself and waits there.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      sounds.pause();
    } else if (!paused) {
      sounds.resume();
    }
    // The screen lock goes whenever the page is hidden: ask for it again.
    if (duo && !document.hidden) keepAwake(true);
  });
  // The About panel (name and version) opens over the start or end screen.
  function showAbout(open) {
    el('about').hidden = !open;
    el(open ? 'close-about' : 'info').focus();
  }
  el('info').addEventListener('click', () => showAbout(true));
  el('close-about').addEventListener('click', () => showAbout(false));
  // Esc closes whatever is open on top; in play, Esc or P pauses and resumes.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el('rules').hidden) closeHelp();
    else if (event.key === 'Escape' && !el('about').hidden) showAbout(false);
    else if ((event.key === 'Escape' || event.code === 'KeyP') && state === 'playing') (paused ? resume : pause)();
  });
  window.addEventListener('resize', resize);

  // The Play with friends panel.
  try {
    el('duo-name').value = localStorage.getItem(NAME_KEY) || '';
  } catch (error) {
    // Private browsing: no name kept.
  }
  el('two').addEventListener('click', () => showDuo(duo ? duoBox : 'choose', ''));
  el('duo-host').addEventListener('click', hostGame);
  el('duo-join').addEventListener('click', () => {
    if (!readName()) return needName();
    showDuo('join', '');
    el('duo-code-in').focus();
  });
  el('duo-go').addEventListener('click', () => joinGame(el('duo-code-in').value));
  el('duo-code-in').addEventListener('input', () => { el('duo-code-in').value = Net.cleanCode(el('duo-code-in').value); });
  el('duo-code-in').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinGame(el('duo-code-in').value); });
  el('duo-name').addEventListener('input', () => el('duo-name').classList.remove('want'));
  el('duo-share').addEventListener('click', shareLink);
  el('duo-race').addEventListener('click', () => startTogether('race'));
  el('duo-explore').addEventListener('click', () => startTogether('explore'));
  el('duo-back').addEventListener('click', closeDuo);
  // A shared link opens the Join panel with its code filled in.
  if (params.has('join') && !auto) {
    el('duo-code-in').value = Net.cleanCode(params.get('join'));
    showDuo('join', 'Type your name if it is not there, then press Join.');
  }

  resize();
  // Test hooks: &duo=host (with &code, &name, &start=race|explore, and
  // &players=N to start once N phones are in, 2 by default) or &duo=join
  // (with &code, &name) play a game with friends through the test page;
  // &report sends it how things stand ten times a second, and it can ask
  // this phone to pause, resume, leave or play again.
  if (auto && params.has('duo')) {
    el('duo-name').value = params.get('name') || (params.get('duo') === 'host' ? 'Host' : 'Guest');
    if (params.get('duo') === 'host') hostGame();
    else joinGame(params.get('code') || '');
    if (reportsWanted) setInterval(reportTogether, 100);
    window.addEventListener('message', (event) => {
      const command = event.source === window.parent && event.data && event.data.duoCommand;
      if (command === 'pause') pause();
      else if (command === 'resume') resume();
      else if (command === 'leave') leaveTogether();
      else if (command === 'again') el('again').click();
    });
  } else if (auto) {
    start(params.get('mode') === 'explore' ? 'explore' : 'race');
  }
  requestAnimationFrame(frame);
})();
