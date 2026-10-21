// Pixel art drawn in code: the animals and small items, as text grids (one
// character per pixel, looked up in PALETTE). Trees, rocks and the ground are
// generated from shapes in scenery.js.

// Repeatable random numbers, so the art and the park are the same every run.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Sprites = (() => {
  const PALETTE = {
    k: '#2b1d16', // outline
    o: '#d0702c', // squirrel fur
    O: '#9c4a1c', // squirrel fur, shaded
    c: '#f1d9b0', // cream belly
    e: '#1a1a1a', // eye
    n: '#e58a8a', // nose
    w: '#ffffff',
    a: '#d59a3c', // acorn
    y: '#f0c670', // acorn highlight
    A: '#6a4322', // acorn cap
    b: '#7a4a2a', // bark
    G: '#2a6e33', // stem
    l: '#6cc04f', // leaf
    r: '#d8453c',
    J: '#3f6fd8', // blue jay
    j: '#86b6f2', // blue jay, light
    h: '#a27048', // groundhog fur
    H: '#6f472b', // groundhog fur, shaded
    d: '#b89462', // loose dirt
    D: '#7d5c3a', // dirt, shaded
    x: '#1a120e', // inside a hole
  };

  // A squirrel standing still waits IDLE_START seconds, then repeats a little
  // routine every IDLE_CYCLE seconds: a burst of sniffs, a blink, an ear or tail flick.
  const IDLE_START = 1;
  const IDLE_CYCLE = 3.2;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function fromText(rows, overrides) {
    const colors = Object.assign({}, PALETTE, overrides);
    const c = canvas(Math.max(...rows.map((r) => r.length)), rows.length);
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') continue;
        g.fillStyle = colors[row[x]];
        g.fillRect(x, y, 1, 1);
      }
    });
    return c;
  }

  function mirrored(source) {
    const c = canvas(source.width, source.height);
    const g = c.getContext('2d');
    g.scale(-1, 1);
    g.drawImage(source, -source.width, 0);
    return c;
  }

  // Rows `from`..`to` of a sprite as a sprite of their own.
  function slice(source, from, to) {
    const c = canvas(source.width, to - from);
    c.getContext('2d').drawImage(source, 0, -from);
    return c;
  }

  // A copy of a sprite with one rectangle of it shifted by (dx, dy): a lifted
  // head, a twitched ear. With `stretch` (for a part moving up) the row it
  // leaves behind keeps its pixels, so the part looks raised, not cut off.
  function nudged(source, x, y, w, h, dx, dy, stretch) {
    const c = canvas(source.width, source.height);
    const g = c.getContext('2d');
    g.drawImage(source, 0, 0);
    g.clearRect(x, y, w, h);
    g.clearRect(x + dx, y + dy, w, h);
    g.drawImage(source, x, y, w, h, x + dx, y + dy, w, h);
    if (stretch) g.drawImage(source, x, y + h - 1, w, 1, x, y + h - 1, w, 1);
    return c;
  }

  function shadow(w, h) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 < 1) g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  const SQUIRREL_RIGHT = [
    '................',
    '................',
    '..kkkk..........',
    '.kOoook....k.k..',
    'kOoooook..kokok.',
    'kOooooook.koook.',
    'kOoooooOkkoooook',
    'kOooooOkoooeoook',
    '.kOoooOkoooooonk',
    '.kOooOkooooocck.',
    '..kOoOkoooocck..',
    '..kOOkoooccck...',
    '...kkoooccok....',
    '....kookkook....',
    '....kkk..kkk....',
    '................',
  ];

  const SQUIRREL_DOWN = [
    '................',
    '....k......k....',
    '...kok....kok...',
    '...kookkkkook...',
    '..kooooooooook..',
    '..koeooooooeok..',
    '..kooccnnccook..',
    '...koccccccok...',
    '...kooccccookOk.',
    '..kooccccccookOk',
    '..kooccccccookOk',
    '..kooccccccookk.',
    '...kooccccook...',
    '...kOokkkkoOk...',
    '....kk....kk....',
    '................',
  ];

  const SQUIRREL_UP = [
    '................',
    '....k......k....',
    '...kok....kok...',
    '...kookkkkook...',
    '..kooooooooook..',
    '..kooooooooook..',
    '..kooooooooook..',
    '...kooooooook...',
    '...kooOOOOook...',
    '..kooOOooOOook..',
    '..kooOooooOook..',
    '..kooOOooOOook..',
    '...kooOOOOook...',
    '...kOokkkkoOk...',
    '....kk....kk....',
    '................',
  ];

  // One squirrel in all four facings; `overrides` recolours it. Each facing has
  // its resting pose plus the poses of the idle routine: head lifted to sniff,
  // eyes shut, and a flick (the tail tip from the side, an ear from front or back).
  function squirrel(overrides) {
    const eyesShut = Object.assign({}, overrides, { e: (overrides && overrides.O) || PALETTE.O });
    const right = { rest: fromText(SQUIRREL_RIGHT, overrides), blink: fromText(SQUIRREL_RIGHT, eyesShut) };
    right.sniff = nudged(right.rest, 9, 3, 7, 7, 0, -1, true);
    right.flick = nudged(right.rest, 0, 2, 9, 4, 1, 0, false);
    const left = {};
    for (const pose of Object.keys(right)) left[pose] = mirrored(right[pose]);
    const headOn = (rows) => {
      const rest = fromText(rows, overrides);
      return {
        rest,
        blink: fromText(rows, eyesShut),
        sniff: nudged(rest, 0, 1, 16, 7, 0, -1, true),
        flick: nudged(rest, 10, 1, 3, 2, 0, 1, false),
      };
    };
    return { right, left, down: headOn(SQUIRREL_DOWN), up: headOn(SQUIRREL_UP) };
  }

  // The pose for a squirrel that has stood still for `idle` seconds.
  function idleFrame(poses, idle) {
    if (idle < IDLE_START) return poses.rest;
    const t = (idle - IDLE_START) % IDLE_CYCLE;
    if (t < 0.48) return Math.floor(t / 0.12) % 2 === 0 ? poses.sniff : poses.rest;
    if (t > 1.3 && t < 1.42) return poses.blink;
    if ((t > 2.1 && t < 2.24) || (t > 2.36 && t < 2.5)) return poses.flick;
    return poses.rest;
  }

  // An animal that gets an acorn jumps for joy, twice. Its `joy` counts down
  // the seconds of jumping it has left.
  const JOY_JUMP = 0.24;   // seconds one jump takes

  // The jumping to start, or to carry on with: another acorn in mid-jump
  // finishes that jump and adds two more, so the animal never drops out of the air.
  function cheer(joy) {
    return 2 * JOY_JUMP + (joy > 0 ? joy % JOY_JUMP : 0);
  }

  // How far off the ground to draw an animal with `joy` seconds of jumping
  // left, at most `height` pixels: an arc for each jump.
  function joyLift(joy, height) {
    if (joy <= 0) return 0;
    const part = (joy % JOY_JUMP) / JOY_JUMP;
    return Math.round(height * 4 * part * (1 - part));
  }

  const ACORN = [
    '...kk...',
    '...kb...',
    '.kAAAAk.',
    'kAAAAAAk',
    'kAAAAAAk',
    '.kayaak.',
    '.kayaak.',
    '.kaaaak.',
    '..kaak..',
    '...kk...',
  ];
  const acorn = fromText(ACORN);
  // The golden acorn hidden in the log cabin (1.12): the same acorn in gold.
  const goldenAcorn = fromText(ACORN, { a: '#f2c230', y: '#fff6b0', A: '#b8862a', b: '#8a5a1a', k: '#5a3a10' });

  // Blue jay in flight, facing right: wings up, then wings down.
  const JAY = [
    [
      '......jj........',
      '.....jJJj.k.....',
      '.....jJJJkJk....',
      '....kjJJJJJJk...',
      'kk.kJJJJJJJeJkk.',
      'kJJJJJJJJJwwk...',
      '.kkJJJJJwwwk....',
      '...kkwwwwkk.....',
      '.....kkkk.......',
      '................',
    ],
    [
      '................',
      '..........k.....',
      '.........kJk....',
      '....kkkkkJJJk...',
      'kk.kJJJJJJJeJkk.',
      'kJJJjjjJJJwwk...',
      '.kkJjJJjwwwk....',
      '...kjJJjwkk.....',
      '....kjjk........',
      '.....kk.........',
    ],
  ];
  const jayRight = JAY.map((rows) => fromText(rows));

  // Blue jay sitting, facing right, wings folded. The top row is spare, for
  // the pose with its head raised.
  const JAY_SITTING = [
    '............',
    '.......k....',
    '......kJk...',
    '.....kJJJk..',
    '.....kJweJkk',
    '....kJJwwwk.',
    '...kJJjkkwk.',
    '..kJJjjJwwk.',
    '.kJJjjJJwwk.',
    'kJJJkJJwwk..',
    'kJJk.kkkkk..',
    '.kk...k.k...',
  ];
  // The same bird looking back over its shoulder: only the head rows differ.
  const JAY_LOOKING_BACK = [
    '............',
    '......k.....',
    '.....kJk....',
    '....kJJJk...',
    '..kkJewJk...',
    '....kwwJJk..',
  ];
  function sittingJay() {
    const rest = fromText(JAY_SITTING);
    const poses = {
      rest,
      turned: fromText(JAY_LOOKING_BACK.concat(JAY_SITTING.slice(JAY_LOOKING_BACK.length))),
      up: nudged(rest, 4, 1, 8, 5, 0, -1, true),
    };
    const left = {};
    for (const pose of Object.keys(poses)) left[pose] = mirrored(poses[pose]);
    return { right: poses, left };
  }

  // Groundhog, head and shoulders, as it stands up out of its hole.
  const GROUNDHOG = [
    '....kk....kk....',
    '...khhkkkkhhk...',
    '..khhhhhhhhhhk..',
    '..khehhhhhhehk..',
    '..khhhccccchhk..',
    '..khhcckkcchhk..',
    '...khccwwcchk...',
    '..kHhhcccchhHk..',
    '.kHHhkhcchkhHHk.',
    '.kHHhhhcchhhHHk.',
  ];
  const groundhog = fromText(GROUNDHOG);
  // The same with its eyes turned to one side, for a groundhog having a look round.
  const glancing = (eyes) => fromText(GROUNDHOG.map((row, y) => (y === 3 ? eyes : row)));
  const groundhogLooks = [groundhog, glancing('..kehhhhhhehhk..'), groundhog, glancing('..khhehhhhhhek..')];

  // Groundhog out of its hole, on all fours and facing right. The two frames
  // differ only in the legs.
  const GROUNDHOG_WALKING = [
    '......kkkkkk........',
    '....kkhhhhhhkk.kk...',
    '...khhhhhhhhhhkhhkk.',
    '..khhhhhhhhhhhhhhhhk',
    '.kHhhhhhhhhhhhhhehhk',
    'kHHhhhhhhhhhhhhhhhck',
    'kHHhhhhhhhhhhhhhcckk',
    'kHHhhhhhhhhhhhhccck.',
    '.kHHhhhhhhhhhhkkkk..',
  ];
  const GROUNDHOG_STEPS = [
    ['..kHHhkkkkkhhhk.....', '..kHHk.....khhk.....', '..kkkk.....kkkk.....'],
    ['..kkkHHkkhhkkkk.....', '....kHHk.khhk.......', '....kkkk.kkkk.......'],
  ];
  const groundhogWalkRight = GROUNDHOG_STEPS.map((legs) => fromText(GROUNDHOG_WALKING.concat(legs)));

  const hole = fromText([
    '....dddddddd....',
    '..ddDDDDDDDDdd..',
    '.dDDxxxxxxxxDDd.',
    '.dDxxxxxxxxxxDd.',
    '..dDDxxxxxxDDd..',
    '....dddddddd....',
  ]);

  // Dirt heaving just before a groundhog surfaces (two frames).
  const mound = [
    fromText([
      '................',
      '......dddd......',
      '....ddDdDddd....',
      '...dDddDdDdDd...',
      '..dDdDdddDdDdd..',
      '....dddddddd....',
    ]),
    fromText([
      '.......dd.......',
      '.....dddDdd.....',
      '....dDdDddDd....',
      '...ddDdDdDddd...',
      '..ddDddDdDdDdd..',
      '....dddddddd....',
    ]),
  ];

  // Hint arrows: one pointing right and one pointing down-right, turned and
  // mirrored into all eight directions.
  const ARROW_RIGHT = [
    'kk.....',
    'kyk....',
    'kyyk...',
    'kyyyk..',
    'kyyyyk.',
    'kyyyk..',
    'kyyk...',
    'kyk....',
    'kk.....',
  ];
  const ARROW_DOWN_RIGHT = [
    '......kk',
    '.....kyk',
    '....kyyk',
    '...kyyyk',
    '..kyyyyk',
    '.kyyyyyk',
    'kyyyyyyk',
    'kkkkkkkk',
  ];
  const flipped = (rows) => rows.slice().reverse();
  const mirroredRows = (rows) => rows.map((row) => row.split('').reverse().join(''));
  // A quarter turn clockwise.
  const turned = (rows) => rows[0].split('').map((_, x) => rows.map((row) => row[x]).reverse().join(''));
  const arrowDown = turned(ARROW_RIGHT);
  // Clockwise from "right", in eighths of a turn: the order Hud.hintArrows uses.
  const arrows = [
    ARROW_RIGHT, ARROW_DOWN_RIGHT, arrowDown, mirroredRows(ARROW_DOWN_RIGHT),
    mirroredRows(ARROW_RIGHT), mirroredRows(flipped(ARROW_DOWN_RIGHT)), flipped(arrowDown), flipped(ARROW_DOWN_RIGHT),
  ].map((rows) => fromText(rows));

  const FLOWER = [
    '..F..',
    '.FyF.',
    '..F..',
    '..G..',
    '.lG..',
    '..Gl.',
  ];

  const mushroom = fromText([
    '..kkk..',
    '.krrrk.',
    'krwrrrk',
    'krrrwrk',
    '.kccck.',
    '..kck..',
    '..kkk..',
  ]);

  return {
    IDLE_START,
    IDLE_CYCLE,
    canvas,
    shadow,
    squirrel: squirrel(),
    greySquirrel: squirrel({ o: '#a3a3ae', O: '#6f6f7c', c: '#eeeef2' }),
    // The second player's squirrel in a game with friends (1.13): a black squirrel;
    // the third's and the fourth's (1.14): a white one and a brown one.
    blackSquirrel: squirrel({ o: '#4f4842', O: '#332d29', c: '#a2968a' }),
    whiteSquirrel: squirrel({ o: '#ece6da', O: '#c3b8a6', c: '#fbf8f2' }),
    brownSquirrel: squirrel({ o: '#83532f', O: '#5c3a22', c: '#cfa978' }),
    idleFrame,
    cheer,
    joyLift,
    acorn,
    goldenAcorn,
    jay: { right: jayRight, left: jayRight.map(mirrored) },
    jaySitting: sittingJay(),
    groundhog,
    groundhogLooks,
    groundhogWalk: { right: groundhogWalkRight, left: groundhogWalkRight.map(mirrored) },
    hole,
    holeFront: slice(hole, 3, 6),
    mound,
    arrows,
    flowers: {
      flowerRed: fromText(FLOWER, { F: '#e2504a' }),
      flowerYellow: fromText(FLOWER, { F: '#f4d24a', y: '#ffffff' }),
      flowerPurple: fromText(FLOWER, { F: '#a879e0' }),
    },
    mushroom,
    shadowSmall: shadow(10, 4),
  };
})();
