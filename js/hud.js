// On-screen helpers that are easier to test away from the game loop: the
// minimap, and the arrows that point to acorns beyond the edge of the screen.

const Hud = (() => {
  const MINIMAP_SIZE = 48;     // pixels: the whole park squeezed into a square this big
  const ARROW_CLEARANCE = 6;   // gap kept between an arrow and anything it must avoid
  const ARROW_SPACING = 10;    // and between two arrows

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // A miniature of the park: hedge, grass, the paths, the ponds and the stream
  // with its bridges, the mountain at the east edge, the log cabin's roof, the
  // windmill and the well (1.17), the hedged field and its meadow (1.18), and tree tops.
  function buildMinimap(level) {
    const c = Sprites.canvas(MINIMAP_SIZE, MINIMAP_SIZE);
    const g = c.getContext('2d');
    const cell = level.size / MINIMAP_SIZE;
    const ponds = level.ponds || [level.pond];
    const streams = level.streams || [];
    const foot = level.mountain && level.mountain.foot;
    const treeCells = new Set();
    for (const prop of level.props) {
      const art = Scenery.props[prop.sprite];
      // Mark the cell under the middle of the canopy, not the foot of the trunk.
      if (art.hides && art.tops) treeCells.add(Math.floor(prop.x / cell) + Math.floor((prop.y - art.frames[0].height / 2) / cell) * MINIMAP_SIZE);
    }
    const inWater = (x, y) => ponds.some((pond) => ((x - pond.x) / pond.a) ** 2 + ((y - pond.y) / pond.b) ** 2 < 1)
      || streams.some((stretch) => stretch.points.some((point) => Math.hypot(x - point.x, y - point.y) < Math.max(cell / 2, point.half)));
    const onBridge = (x, y) => streams.some(({ bridge }) => Math.abs(x - bridge.x) < cell / 2 && Math.abs(y - bridge.y) < cell / 2);
    const onMountain = (x, y) => foot && foot.shape(x - foot.x, y - foot.y) < 1;
    const inHedge = (x, y) => x < level.border || y < level.border || x > level.size - level.border || y > level.size - level.border;
    const pathPoints = (level.paths || []).flatMap((path) => path.points.filter((point, i) => i % 4 === 0));
    const onPath = (x, y) => pathPoints.some((point) => Math.abs(x - point.x) < cell / 2 && Math.abs(y - point.y) < cell / 2);
    // The roof covers the cabin's walls, a little up the picture from its foot.
    const cabin = level.cabin;
    const onCabin = (x, y) => cabin && Math.abs(x - cabin.x) < cabin.ends && y > cabin.y - cabin.depth - 12 && y < cabin.y - 6;
    const stoneBuilt = [level.mill, level.well].filter(Boolean);
    const onStone = (x, y) => stoneBuilt.some((one) => Math.abs(x - one.x) < 13 && y > one.y - 24 && y < one.y);
    // The field's hedge, broken at its gate and its gap, and its meadow.
    const hedgerow = level.hedgerow;
    const hedgePoints = hedgerow ? hedgerow.line.filter((point, i) => i % 3 === 0 && !hedgerow.gaps.some(([from, to]) => point.s >= from && point.s <= to)) : [];
    const onHedgerow = (x, y) => hedgePoints.some((point) => Math.abs(x - point.x) < cell / 2 && Math.abs(y - point.y) < cell / 2);
    const inMeadow = level.inMeadow || (() => false);
    for (let my = 0; my < MINIMAP_SIZE; my++) {
      for (let mx = 0; mx < MINIMAP_SIZE; mx++) {
        const x = (mx + 0.5) * cell;
        const y = (my + 0.5) * cell;
        // The mountain stands over the hedge, and the stream runs out through it.
        if (onMountain(x, y)) {
          g.fillStyle = '#8a8a96';
        } else if (onCabin(x, y)) {
          g.fillStyle = '#6e604a';
        } else if (onStone(x, y)) {
          g.fillStyle = '#a89e90';
        } else if (onBridge(x, y)) {
          g.fillStyle = '#8f5a34';
        } else if (inWater(x, y)) {
          g.fillStyle = '#4a90d9';
        } else if (onPath(x, y)) {
          g.fillStyle = '#b89a68';
        } else if (inHedge(x, y) || onHedgerow(x, y)) {
          g.fillStyle = '#1f5226';
        } else {
          g.fillStyle = treeCells.has(mx + my * MINIMAP_SIZE) ? '#2d7a37' : inMeadow(x, y) ? '#8ab84e' : '#5cab46';
        }
        g.fillRect(mx, my, 1, 1);
      }
    }
    return c;
  }

  // Draw the minimap: the miniature, a frame round the part of the park that
  // is on screen (`view`, in park pixels), and a pulsing dot for the squirrel.
  // `others` are the other players' squirrels (games with friends), { x, y,
  // color }: a steady dot in each one's colour, with a light rim.
  function drawMinimap(g, miniature, level, player, view, clock, others = []) {
    const cell = level.size / MINIMAP_SIZE;
    g.drawImage(miniature, 0, 0);

    const left = clamp(Math.floor(view.x / cell), 0, MINIMAP_SIZE - 1);
    const top = clamp(Math.floor(view.y / cell), 0, MINIMAP_SIZE - 1);
    const right = clamp(Math.ceil((view.x + view.w) / cell) - 1, 0, MINIMAP_SIZE - 1);
    const bottom = clamp(Math.ceil((view.y + view.h) / cell) - 1, 0, MINIMAP_SIZE - 1);
    g.fillStyle = 'rgba(255, 255, 255, 0.7)';
    g.fillRect(left, top, right - left + 1, 1);
    g.fillRect(left, bottom, right - left + 1, 1);
    g.fillRect(left, top + 1, 1, bottom - top - 1);
    g.fillRect(right, top + 1, 1, bottom - top - 1);

    for (const other of others) {
      const ox = clamp(Math.round(other.x / cell) - 1, 1, MINIMAP_SIZE - 3);
      const oy = clamp(Math.round((other.y - 6) / cell) - 1, 1, MINIMAP_SIZE - 3);
      g.fillStyle = '#f4f0e8';
      g.fillRect(ox - 1, oy - 1, 4, 4);
      g.fillStyle = other.color;
      g.fillRect(ox, oy, 2, 2);
    }

    // A two-pixel dot with a dark rim, centred on the squirrel.
    const x = clamp(Math.round(player.x / cell) - 1, 1, MINIMAP_SIZE - 3);
    const y = clamp(Math.round((player.y - 6) / cell) - 1, 1, MINIMAP_SIZE - 3);
    g.fillStyle = '#2b1d16';
    g.fillRect(x - 1, y - 1, 4, 4);
    g.fillStyle = Math.floor(clock * 2.5) % 2 ? '#ffffff' : '#f0a030';
    g.fillRect(x, y, 2, 2);
  }

  // Hint arrows for the `limit` nearest acorns that are out of sight.
  //
  // Everything here is in screen pixels except `view`, the camera rectangle in
  // park pixels. `safe` is the rectangle arrows may sit in: an acorn inside it
  // (and not behind a `keepOut` rectangle such as the minimap) counts as in
  // sight and gets no arrow. Each arrow sits on the edge of `safe`, on the line
  // from the squirrel through its acorn, then is slid along that edge clear of
  // the `keepOut` rectangles and of the other arrows.
  //
  // `direction` counts clockwise in eighths of a turn from "right"
  // (0 right, 2 down, 4 left, 6 up), matching Sprites.arrows.
  function hintArrows(player, acorns, view, limit, safe, keepOut) {
    const toScreen = (acorn) => ({ x: acorn.x - view.x, y: acorn.y - 6 - view.y });
    // In the safe rectangle and not hidden behind something like the minimap.
    const inSight = (spot) => spot.x >= safe.left && spot.x <= safe.right && spot.y >= safe.top && spot.y <= safe.bottom
      && !keepOut.some((box) => spot.x > box.left && spot.x < box.right && spot.y > box.top && spot.y < box.bottom);
    const distance = (acorn) => Math.hypot(acorn.x - player.x, acorn.y - player.y);
    const targets = acorns.filter((acorn) => !inSight(toScreen(acorn)))
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, limit);

    const arrows = [];
    for (const acorn of targets) {
      const fromX = clamp(player.x - view.x, safe.left, safe.right);
      const fromY = clamp(player.y - 8 - view.y, safe.top, safe.bottom);
      const dx = toScreen(acorn).x - fromX;
      const dy = toScreen(acorn).y - fromY;
      // How far along the line we can go before leaving the safe rectangle.
      const reachX = dx > 0 ? (safe.right - fromX) / dx : dx < 0 ? (safe.left - fromX) / dx : Infinity;
      const reachY = dy > 0 ? (safe.bottom - fromY) / dy : dy < 0 ? (safe.top - fromY) / dy : Infinity;
      const reach = Math.min(reachX, reachY);
      const arrow = {
        x: Math.round(fromX + dx * reach),
        y: Math.round(fromY + dy * reach),
        direction: ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8,
        acorn,
      };
      // On the top or bottom edge an arrow can slide sideways; on a side edge, up or down.
      const axis = reachY <= reachX ? 'x' : 'y';
      const min = axis === 'x' ? safe.left : safe.top;
      const max = axis === 'x' ? safe.right : safe.bottom;
      const wanted = arrow[axis];
      const inTheWay = () => keepOut.some((box) => arrow.x > box.left - ARROW_CLEARANCE && arrow.x < box.right + ARROW_CLEARANCE
          && arrow.y > box.top - ARROW_CLEARANCE && arrow.y < box.bottom + ARROW_CLEARANCE)
        || arrows.some((other) => Math.abs(other.x - arrow.x) < ARROW_SPACING && Math.abs(other.y - arrow.y) < ARROW_SPACING);
      // If that spot is taken, try spots further and further along the edge, either side of it.
      for (let offset = 1; inTheWay() && offset <= max - min; offset++) {
        for (const spot of [wanted - offset, wanted + offset]) {
          if (spot < min || spot > max) continue;
          arrow[axis] = spot;
          if (!inTheWay()) break;
        }
      }
      if (inTheWay()) arrow[axis] = wanted;   // nowhere free on this edge: leave it where it points
      arrows.push(arrow);
    }
    return arrows;
  }

  return { MINIMAP_SIZE, buildMinimap, drawMinimap, hintArrows };
})();
