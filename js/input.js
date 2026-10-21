// Movement input: WASD / arrow keys, or a joystick that appears wherever a
// finger (or the mouse) presses on the game.

const Input = (() => {
  const STICK_RADIUS = 48;   // CSS pixels, matches #stick in style.css
  const DEAD_ZONE = 0.15;
  const KEYS = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
  };

  const held = new Set();
  const canvas = document.getElementById('game');
  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('knob');
  let stick = null;   // { id, originX, originY, x, y } with x, y in -1..1

  // Typing in a box (a name, a code) is left alone.
  const typing = (event) => event.target instanceof Element && event.target.closest('input, textarea') !== null;

  window.addEventListener('keydown', (event) => {
    if (KEYS[event.code] && !typing(event)) {
      held.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => { held.clear(); endStick(); });

  canvas.addEventListener('pointerdown', (event) => {
    if (stick) return;
    stick = { id: event.pointerId, originX: event.clientX, originY: event.clientY, x: 0, y: 0 };
    try {
      // Keep receiving this pointer's moves even if it slides off the canvas.
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Not fatal: the joystick still works while the pointer stays over the game.
    }
    stickEl.style.left = event.clientX + 'px';
    stickEl.style.top = event.clientY + 'px';
    stickEl.hidden = false;
    moveKnob();
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!stick || event.pointerId !== stick.id) return;
    let x = (event.clientX - stick.originX) / STICK_RADIUS;
    let y = (event.clientY - stick.originY) / STICK_RADIUS;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    stick.x = x;
    stick.y = y;
    moveKnob();
  });

  function endStick(event) {
    if (!stick || (event && event.pointerId !== stick.id)) return;
    stick = null;
    stickEl.hidden = true;
  }
  canvas.addEventListener('pointerup', endStick);
  canvas.addEventListener('pointercancel', endStick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function moveKnob() {
    knobEl.style.transform = `translate(${stick.x * STICK_RADIUS}px, ${stick.y * STICK_RADIUS}px)`;
  }

  // Direction to move in, with length 0..1.
  function vector() {
    let x = 0;
    let y = 0;
    for (const code of held) {
      x += KEYS[code][0];
      y += KEYS[code][1];
    }
    if (x || y) {
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    }
    if (stick && Math.hypot(stick.x, stick.y) > DEAD_ZONE) {
      return { x: stick.x, y: stick.y };
    }
    return { x: 0, y: 0 };
  }

  return { vector, release: () => { held.clear(); endStick(); } };
})();
