// Sound: the game's beeps, and the park's own quiet sounds round the squirrel:
// water babbling and bubbling, the rush of the waterfall, leaves in a gust,
// jays singing, groundhogs scratching at the dirt, the cabin's fire crackling
// and its door creaking, ducks quacking and splashes. Everything is made in
// code with the Web Audio API; nothing is loaded.

const Sound = (() => {
  // Each beep is a few square-wave notes: [frequency, delay, length]. The
  // thieves' warnings (chirp, rumble, pop, scared) are beeps, and louder than
  // anything in the background, so a thief always sounds different.
  const BEEPS = {
    pickup: [[880, 0, 0.08], [1320, 0.07, 0.12]],
    stolen: [[520, 0, 0.09], [390, 0.08, 0.14]],
    chirp: [[2100, 0, 0.05], [2600, 0.07, 0.05], [2100, 0.14, 0.06]],
    scared: [[1500, 0, 0.05], [1100, 0.05, 0.08]],
    rumble: [[110, 0, 0.12], [95, 0.1, 0.12]],
    pop: [[300, 0, 0.05], [450, 0.04, 0.06]],
    finish: [[523, 0, 0.25], [659, 0.12, 0.25], [784, 0.24, 0.25], [1047, 0.36, 0.25]],
    golden: [[1319, 0, 0.07], [1568, 0.06, 0.07], [2093, 0.12, 0.08], [2637, 0.2, 0.22]],   // the golden acorn
  };
  const BEEP_LEVEL = 0.05;
  // How far each background sound carries (game pixels), and how loud it is at
  // its loudest: about a third of a beep for the water and the waterfall, less
  // for the leaves (measured in local-tests/sound-test.html).
  const WATER = { near: 10, reach: 150, level: 0.062, bubble: 0.004, bubblesPerSecond: 5 };
  const FALLS = { near: 24, reach: 190, level: 0.046 };
  const RUSTLE = { level: 0.0113 };
  const CALL = { near: 16, reach: 170 };
  const SONG = { level: 0.035, every: [3, 8] };   // seconds between songs from a sitting jay
  const SCRATCH = { level: 0.1, every: [0.35, 0.6] };
  // The cabin's fire: a soft hiss, about as loud as the water beside it, and
  // crackles, more often the nearer the squirrel is. The door's creak, under a
  // third of a beep.
  const FIRE = { near: 14, reach: 120, level: 0.06, crackle: 0.09, cracklesPerSecond: 7 };
  const CREAK = { level: 0.12 };
  // Ducks quack now and then, about as loud as a jay's song (1.15); a fish
  // leaping and a duck coming down or taking off splash, softly.
  const QUACK = { level: 0.05, every: [5, 14] };
  const SPLASH = { level: 0.05 };
  const FADE = 0.03;                               // switching on or off takes about three times this

  // 1 within `near`, falling to 0 at `reach`, and faster further out.
  const nearness = (distance, near, reach) => Math.max(0, Math.min(1, 1 - (distance - near) / (reach - near))) ** 2;
  // Left and right, for something `dx` pixels to the side of the squirrel.
  const sideOf = (dx) => Math.max(-1, Math.min(1, dx / 120)) * 0.7;

  // `options.context`: an AudioContext (or OfflineAudioContext, for tests) to
  // use instead of making one on the first tap. `options.random`: where the
  // background sounds get their chance, so tests can repeat themselves.
  function create(options = {}) {
    const random = options.random || Math.random;
    let context = null;
    let on = true;
    let parts = null;   // the audio graph, once there is a context
    // Each animal heard lately, and when it may next make a sound.
    let heard = new Map();

    function build(made) {
      context = made;
      const master = context.createGain();
      master.gain.value = on ? 1 : 0;
      master.connect(context.destination);
      // Two seconds of white noise, looped by every continuous sound.
      const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < samples.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        samples[i] = (seed >>> 0) / 2147483648 - 1;
      }
      const panner = (into) => {
        if (!context.createStereoPanner) return { node: into, pan: null };
        const node = context.createStereoPanner();
        node.connect(into);
        return { node, pan: node.pan };
      };
      // A looping noise through the given filters, into a gain we can turn up and down.
      const layer = (filters, into) => {
        const source = context.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        let last = source;
        for (const [type, frequency, q] of filters) {
          const filter = context.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = frequency;
          filter.Q.value = q;
          last.connect(filter);
          last = filter;
        }
        const swell = context.createGain();   // the babble's quick ups and downs
        const level = context.createGain();   // how near the squirrel is
        level.gain.value = 0;
        last.connect(swell).connect(level).connect(into);
        source.start(0, random() * 2);
        return { swell, level };
      };
      const waterSide = panner(master);
      const fallsSide = panner(master);
      const fireSide = panner(master);
      parts = {
        master, noise, waterSide, fallsSide, fireSide,
        // Babbling water: two bands of noise, each rising and falling on its own.
        babble: [layer([['bandpass', 750, 0.9]], waterSide.node), layer([['bandpass', 1900, 1.6]], waterSide.node)],
        falls: layer([['highpass', 220, 0.7], ['lowpass', 1500, 0.7]], fallsSide.node),
        rustle: layer([['highpass', 1600, 0.7], ['bandpass', 4200, 0.6]], master),
        fire: layer([['lowpass', 520, 0.6]], fireSide.node),
        targets: { water: 0, water2: 0, falls: 0, rustle: 0, waterSide: 0, fallsSide: 0, fire: 0, fireSide: 0 },
        nextSwell: [0, 0, 0],
      };
    }

    // Browsers allow sound only after a tap or click: this runs from the Play button.
    function unlock() {
      if (context) {
        if (context.resume) context.resume();
        return;
      }
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        build(options.context || new Context());
        if (context.resume) context.resume();
      } catch (error) {
        context = null;
        parts = null;
      }
    }
    if (options.context) build(options.context);

    function setOn(value, now = context ? context.currentTime : 0) {
      on = value;
      if (parts) parts.master.gain.setTargetAtTime(on ? 1 : 0, now, FADE);
    }

    // One square-wave note, the old way.
    function note(frequency, start, length, peak, side) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(peak, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + length);
      oscillator.connect(gain).connect(panned(side));
      oscillator.start(start);
      oscillator.stop(start + length);
    }

    // Somewhere to plug a short sound in, to the left or right.
    function panned(side) {
      if (!side || !context.createStereoPanner) return parts.master;
      const node = context.createStereoPanner();
      node.pan.value = side;
      node.connect(parts.master);
      return node;
    }

    // A named beep; `volume` 0 to 1, as before; `side` -1 (left) to 1 (right).
    function beep(name, volume = 1, side = 0, now = context ? context.currentTime : 0) {
      if (!parts || !on) return;
      for (const [frequency, delay, length] of BEEPS[name]) note(frequency, now + delay, length, BEEP_LEVEL * volume, side);
    }

    // A jay's song: two to four quick whistled notes, each sliding up or down.
    function song(start, volume, side) {
      const out = panned(side);
      const notes = 2 + Math.floor(random() * 3);
      let at = start;
      const base = 2400 + random() * 900;
      for (let i = 0; i < notes; i++) {
        const length = 0.05 + random() * 0.06;
        const from = base * (0.9 + random() * 0.3);
        const to = from * (random() < 0.6 ? 1.25 : 0.8);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(from, at);
        oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(SONG.level * volume, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        oscillator.connect(gain).connect(out);
        oscillator.start(at);
        oscillator.stop(at + length + 0.01);
        at += length + 0.03 + random() * 0.06;
      }
    }

    // A groundhog's claws in the dirt: a few short, dry scrapes.
    function scratch(start, volume, side) {
      const out = panned(side);
      const scrapes = 2 + Math.floor(random() * 3);
      let at = start;
      for (let i = 0; i < scrapes; i++) {
        const length = 0.025 + random() * 0.035;
        const source = context.createBufferSource();
        source.buffer = parts.noise;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1300 + random() * 900;
        filter.Q.value = 1.4;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(SCRATCH.level * volume, at + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        source.connect(filter).connect(gain).connect(out);
        source.start(at, random() * 1.8, length + 0.01);
        at += length + 0.04 + random() * 0.05;
      }
    }

    // A crackle in the fire: a sharp click of noise, and now and then a
    // deeper pop.
    function crackle(start, volume, side) {
      const pop = random() < 0.2;
      const length = pop ? 0.02 + random() * 0.02 : 0.004 + random() * 0.008;
      const source = context.createBufferSource();
      source.buffer = parts.noise;
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = pop ? 600 : 2200 + random() * 2200;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(FIRE.crackle * volume * (pop ? 1 : 0.35 + random() * 0.65), start + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      source.connect(filter).connect(gain).connect(panned(side));
      source.start(start, random() * 1.9, length + 0.01);
    }

    // The cabin's door swinging open: a short creak, a stutter of little clicks
    // through a wooden ring, rising then falling in pitch.
    function creak(volume = 1, now = context ? context.currentTime : 0) {
      if (!parts || !on) return;
      const start = now + 0.02;
      const length = 0.42;
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(38, start);
      oscillator.frequency.linearRampToValueAtTime(64, start + length * 0.45);
      oscillator.frequency.linearRampToValueAtTime(46, start + length);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1250;
      filter.Q.value = 4;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(CREAK.level * volume, start + 0.06);
      gain.gain.setValueAtTime(CREAK.level * volume, start + length * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(filter).connect(gain).connect(parts.master);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
    }

    // A duck's quack: one, two or three short, nasal calls that fall in pitch.
    function quack(start, volume, side) {
      const out = panned(side);
      const calls = random() < 0.45 ? 1 : random() < 0.75 ? 2 : 3;
      let at = start;
      const base = 300 + random() * 90;
      for (let i = 0; i < calls; i++) {
        const length = 0.1 + random() * 0.05;
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(base, at);
        oscillator.frequency.exponentialRampToValueAtTime(base * 0.72, at + length);
        // Through the bill: a band of the buzz, not all of it.
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100 + random() * 300;
        filter.Q.value = 2.2;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(QUACK.level * volume, at + 0.015);
        gain.gain.setValueAtTime(QUACK.level * volume, at + length * 0.55);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        oscillator.connect(filter).connect(gain).connect(out);
        oscillator.start(at);
        oscillator.stop(at + length + 0.01);
        at += length + 0.05 + random() * 0.05;
      }
    }

    // A splash: a soft burst of spray, and a drop or two falling back.
    function splash(start, volume, side) {
      const out = panned(side);
      const length = 0.12 + random() * 0.06;
      const source = context.createBufferSource();
      source.buffer = parts.noise;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800 + random() * 1200;
      filter.Q.value = 0.9;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(SPLASH.level * volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      source.connect(filter).connect(gain).connect(out);
      source.start(start, random() * 1.8, length + 0.01);
      const drops = 1 + Math.floor(random() * 2);
      for (let i = 0; i < drops; i++) bubble(start + 0.08 + random() * 0.12, volume * 0.8, side);
    }

    // A bubble rising in the water: a soft blip that slides up.
    function bubble(start, volume, side) {
      const length = 0.04 + random() * 0.04;
      const from = 320 + random() * 380;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(from * 2.4, start + length);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(WATER.bubble * volume, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(gain).connect(panned(side));
      oscillator.start(start);
      oscillator.stop(start + length + 0.01);
    }

    // Ease a level towards a new value, but only bother the audio graph when it
    // has moved by a fiftieth of its whole range (`most`).
    function steer(param, key, value, most, now, ease) {
      if (Math.abs(parts.targets[key] - value) < most / 50) return;
      parts.targets[key] = value;
      param.setTargetAtTime(value, now, ease);
    }

    // Once a frame: what the squirrel can hear from where it stands.
    // `scene.listener` is the squirrel; `scene.water` and `scene.falls` are
    // { distance, dx } to the nearest water and to the foot of the waterfall;
    // `scene.breeze` (0 to 1) how hard the leaves round it are moving; and
    // `scene.voices` the animals up to something: { who, kind, x, y }, kind
    // being 'sitting', 'landing' or 'flying' (jays), 'digging' (groundhogs),
    // 'duck', 'duck-landing' or 'duck-flying' (mallards), or 'splash' (a fish
    // leaping, a duck coming down or taking off; heard once); and
    // `scene.fire` { distance, dx } to the cabin's hearth, if there is one.
    function update(dt, scene, now = context ? context.currentTime : 0) {
      if (!parts) return;
      const ahead = now + 0.02;
      const water = nearness(scene.water.distance, WATER.near, WATER.reach);
      steer(parts.babble[0].level.gain, 'water', water * WATER.level, WATER.level, now, 0.25);
      steer(parts.babble[1].level.gain, 'water2', water * WATER.level * 0.6, WATER.level, now, 0.25);
      if (parts.waterSide.pan) steer(parts.waterSide.pan, 'waterSide', sideOf(scene.water.dx), 1, now, 0.3);
      const falls = nearness(scene.falls.distance, FALLS.near, FALLS.reach);
      steer(parts.falls.level.gain, 'falls', falls * FALLS.level, FALLS.level, now, 0.3);
      if (parts.fallsSide.pan) steer(parts.fallsSide.pan, 'fallsSide', sideOf(scene.falls.dx), 1, now, 0.3);
      steer(parts.rustle.level.gain, 'rustle', scene.breeze * RUSTLE.level, RUSTLE.level, now, 0.7);
      const fire = scene.fire ? nearness(scene.fire.distance, FIRE.near, FIRE.reach) : 0;
      steer(parts.fire.level.gain, 'fire', fire * FIRE.level, FIRE.level, now, 0.3);
      if (parts.fireSide.pan && scene.fire) steer(parts.fireSide.pan, 'fireSide', sideOf(scene.fire.dx), 1, now, 0.3);
      // Water babbles: each band rises and falls every tenth of a second or so;
      // the fire's hiss breathes a little slower.
      parts.babble.concat([parts.fire]).forEach((band, i) => {
        if (now < parts.nextSwell[i]) return;
        parts.nextSwell[i] = now + (i < 2 ? 0.05 + random() * 0.12 : 0.1 + random() * 0.2);
        band.swell.gain.setTargetAtTime(i < 2 ? 0.35 + random() * 0.65 : 0.55 + random() * 0.45, now, 0.03);
      });
      if (!on) return;
      if (water > 0 && random() < WATER.bubblesPerSecond * water * dt) bubble(ahead, water, sideOf(scene.water.dx));
      if (fire > 0 && random() < FIRE.cracklesPerSecond * fire * dt) crackle(ahead, fire, sideOf(scene.fire.dx));

      // The animals: a jay sitting nearby sings now and then, one landing calls
      // as it settles, one flying close past may call once; a groundhog
      // digging scratches at the dirt.
      const still = new Map();
      for (const voice of scene.voices) {
        const distance = Math.hypot(voice.x - scene.listener.x, voice.y - scene.listener.y);
        const volume = nearness(distance, CALL.near, CALL.reach);
        const side = sideOf(voice.x - scene.listener.x);
        // Someone new: a groundhog starts scratching at once, a jay sings within a few seconds.
        const was = heard.get(voice.who)
          || { kind: null, next: now + (voice.kind === 'digging' ? 0.05 + random() * 0.2 : SONG.every[0] * random()), called: false };
        if (voice.kind === 'digging') {
          if (volume > 0 && now >= was.next) {
            scratch(ahead, volume, side);
            was.next = now + SCRATCH.every[0] + random() * (SCRATCH.every[1] - SCRATCH.every[0]);
          }
        } else if (voice.kind === 'sitting') {
          if (was.kind === 'landing' && volume > 0) {
            song(ahead, volume, side);   // settling on its perch
            was.next = now + SONG.every[0] + random() * (SONG.every[1] - SONG.every[0]);
          } else if (volume > 0 && now >= was.next) {
            song(ahead, volume, side);
            was.next = now + SONG.every[0] + random() * (SONG.every[1] - SONG.every[0]);
          }
        } else if (voice.kind === 'flying' && !was.called && distance < CALL.reach * 0.5) {
          // Once per pass, decided as it comes close: half the jays flying past call.
          was.called = true;
          if (random() < 0.5) song(ahead, volume, side);
        } else if (voice.kind === 'duck') {
          // A duck on the water quacks now and then, and as it settles after landing.
          if (was.kind === null) was.next = now + QUACK.every[0] * random() * 1.5;
          if (volume > 0 && (was.kind === 'duck-landing' || now >= was.next)) {
            quack(ahead, volume, side);
            was.next = now + QUACK.every[0] + random() * (QUACK.every[1] - QUACK.every[0]);
          }
        } else if ((voice.kind === 'duck-flying' || voice.kind === 'duck-landing') && !was.called && distance < CALL.reach * 0.6) {
          // In the air it may call once as it passes close.
          was.called = true;
          if (random() < 0.4) quack(ahead, volume, side);
        } else if (voice.kind === 'splash' && was.kind === null) {
          if (volume > 0) splash(ahead, volume, side);   // heard once, as it happens
        }
        was.kind = voice.kind;
        still.set(voice.who, was);
      }
      heard = still;
    }

    return {
      unlock, setOn, beep, creak, update,
      isOn: () => on,
      // A hidden page goes quiet; the sounds carry on when it comes back.
      pause: () => { if (context && context.suspend) context.suspend(); },
      resume: () => { if (context && context.resume) context.resume(); },
      context: () => context,
    };
  }

  return { create, BEEPS };
})();
