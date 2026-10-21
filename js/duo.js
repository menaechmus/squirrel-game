// Two players on their own phones (1.13): who is playing, the messages
// between the host's phone and the guest's, and the other squirrel drawn
// smoothly from the positions it sends. The host's phone keeps the race (the
// acorns, the clock, who got what); game.js does that. This file only checks
// who sent what and passes it on, as WordGridGame's wifi.js does. The links
// come from net.js.
//
// Messages are objects { t, ... }:
//   guest to host   hello { name, token, version }, me { s, x, y, f, m, e, h },
//                   view { w, h }, ready, took { id, s }, golden { s }, pause, resume, bye
//   host to guest   lobby { host, guest }, round { ... },
//                   tick { s, x, y, f, m, time, p, b, q },
//                   taken { id, by }, grown { id, x, y }, golden { by },
//                   end { counts, time }, denied { why, version }, closed { why }
// `s` is the sender's clock in seconds, so the other side can place each
// position in time however late it arrives, and tell which squirrel reached
// an acorn first. The guest's `e` and `h` hand back the host's latest `s`
// and how long ago it came, so the host can time the round trip.

const Duo = (() => {
  const NAME_LENGTH = 12;
  const BEHIND = 0.1;      // the other squirrel is drawn this many seconds in the past
  const CARRY_ON = 0.15;   // and carried on along its way at most this long when messages stall
  const FACINGS = ['up', 'down', 'left', 'right'];

  // A name as typed: single spaces, trimmed, no longer than the box allows.
  const cleanName = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH);

  const isNumber = (value) => typeof value === 'number' && isFinite(value);

  // A position from the other phone, rebuilt from only what it should hold, or null.
  function cleanSpot(message) {
    if (!isNumber(message.s) || !isNumber(message.x) || !isNumber(message.y)) return null;
    return { s: message.s, x: message.x, y: message.y, facing: FACINGS.includes(message.f) ? message.f : 'down', moving: Boolean(message.m) };
  }

  // A guest's message rebuilt from only what it should hold, or null.
  function cleanFromGuest(message) {
    const t = message && message.t;
    if (t === 'me') {
      const spot = cleanSpot(message);
      if (!spot) return null;
      const echo = isNumber(message.e) && isNumber(message.h) ? { e: message.e, h: Math.max(0, message.h) } : {};
      return Object.assign({ t }, spot, echo);
    }
    if (t === 'view') return isNumber(message.w) && isNumber(message.h) ? { t, w: Math.max(1, Math.min(2000, message.w)), h: Math.max(1, Math.min(2000, message.h)) } : null;
    if (t === 'took') return Number.isInteger(message.id) && message.id >= 0 ? { t, id: message.id, s: isNumber(message.s) ? message.s : null } : null;
    if (t === 'golden') return { t, s: isNumber(message.s) ? message.s : null };
    if (t === 'pause' || t === 'resume' || t === 'ready') return { t };
    return null;
  }

  // Why the host turned this phone away, in words.
  function deniedText({ why, version }, ours) {
    if (why === 'version') return `This phone has version ${ours} of the game and the other has ${version}. Reload the page on the older one, then join again.`;
    if (why === 'full') return 'That game already has two players.';
    return 'Type your name first.';
  }

  // ---- the host ----

  // The host waits for one guest. onjoin({ name, back }) hears it arrive, or
  // come back after its link dropped; onleave({ left }) hears it go, `left`
  // true if it said goodbye rather than losing its link; onmessage(message)
  // hears what it sends, cleaned (see cleanFromGuest). Before a game starts a
  // guest that goes loses its place; once one has started, its place is kept
  // for it, and it is known again by the token its tab keeps.
  function createHost({ name, version, onjoin = () => {}, onleave = () => {}, onmessage = () => {} }) {
    let guest = null;   // { name, token, link }
    let started = false;
    let ended = false;

    function deny(link, why) {
      link.send({ t: 'denied', why, version });
      setTimeout(() => link.close(), 3000);
    }

    function hello(link, message) {
      const who = cleanName(message.name);
      const token = typeof message.token === 'string' ? message.token.slice(0, 40) : '';
      if (message.version !== version) return deny(link, 'version');
      if (!who || !token) return deny(link, 'name');
      if (guest && guest.token !== token && (guest.link || started)) return deny(link, 'full');
      const back = Boolean(guest && guest.token === token);
      const old = guest && guest.link;
      // "Sam" playing "Sam" becomes "Sam 2", so the two can be told apart.
      const named = back ? guest.name : who.toLowerCase() === name.toLowerCase() ? `${who.slice(0, NAME_LENGTH - 2)} 2` : who;
      guest = { name: named, token, link };
      if (old && old !== link) {
        old.onclose = null;
        old.close();
      }
      link.onmessage = (next) => heard(link, next);
      link.onclose = () => dropped(link, false);
      onjoin({ name: named, back });
    }

    function heard(link, message) {
      if (!guest || guest.link !== link || ended) return;
      if (message.t === 'bye') {
        link.onclose = null;
        link.close();
        dropped(link, true);
        return;
      }
      const clean = cleanFromGuest(message);
      if (clean) onmessage(clean);
    }

    function dropped(link, left) {
      if (!guest || guest.link !== link) return;
      guest.link = null;
      if (!started || left) guest = null;
      onleave({ left });
    }

    const host = {
      // A link from net.js. The guest says hello first. Once the game has
      // ended, nobody new is let in.
      attach(link) {
        if (ended) {
          link.close();
          return;
        }
        link.onmessage = (message) => {
          if (message.t === 'hello' && !ended) hello(link, message);
        };
        link.onclose = () => {};
      },
      get guest() {
        return guest && { name: guest.name, here: Boolean(guest.link) };
      },
      // Whether a game is on: from then on a guest that drops keeps its place.
      setStarted(on) {
        started = on;
      },
      send(message) {
        if (guest && guest.link) guest.link.send(message);
      },
      // Ends the two-player game for the guest too.
      close(why = 'ended') {
        ended = true;
        if (guest && guest.link) {
          const { link } = guest;
          link.onclose = null;
          link.send({ t: 'closed', why });
          setTimeout(() => link.close(), 500);
        }
        guest = null;
      },
    };
    return host;
  }

  // ---- the guest ----

  // connect() gives a link to the host (net.js joinRoom). join() resolves
  // when the host first answers, or rejects with an error whose message can
  // be shown. After that a lost link is dialled again every `retryMs`, until
  // it is back or the host says no. onmessage(message) hears everything the
  // host sends; onlink(up) hears the link go and come back.
  function createGuest({ name, token, version, connect, onmessage = () => {}, onlink = () => {}, retryMs = 2000 }) {
    let link = null;
    let up = false;
    let stopped = false;
    let retry = 0;
    let waiting = null;   // join()'s promise, until the host first answers

    const answered = (error = null) => {
      if (!waiting) return;
      const { resolve, reject } = waiting;
      waiting = null;
      if (error) {
        guest.stop();
        reject(error);
      } else resolve();
    };

    const again = () => {
      clearTimeout(retry);
      if (!stopped) retry = setTimeout(dial, retryMs);
    };

    function hear(message) {
      if (message.t === 'lobby' || message.t === 'round') {
        if (!up) {
          up = true;
          onlink(true);
        }
        answered();
      } else if (message.t === 'denied' || message.t === 'closed') {
        const first = Boolean(waiting);
        answered(new Error(message.t === 'denied' ? deniedText(message, version) : 'The other player ended the game.'));
        guest.stop();
        if (first) return;
      }
      onmessage(message);
    }

    async function dial() {
      clearTimeout(retry);
      if (stopped) return;
      let next;
      try {
        next = await connect();
      } catch (error) {
        if (waiting) answered(error);
        else again();
        return;
      }
      if (stopped) {
        next.close();
        return;
      }
      link = next;
      link.onmessage = hear;
      link.onclose = () => {
        if (link !== next) return;
        link = null;
        if (up) {
          up = false;
          onlink(false);
        }
        if (waiting) answered(new Error('Lost touch with the other phone. Try again.'));
        else again();
      };
      link.send({ t: 'hello', name, token, version });
    }

    const guest = {
      get connected() {
        return up;
      },
      join() {
        return new Promise((resolve, reject) => {
          waiting = { resolve, reject };
          dial();
        });
      },
      // False when there is no link to send it on.
      send(message) {
        if (!up || !link) return false;
        link.send(message);
        return true;
      },
      // No more dialling, and the link hung up.
      stop() {
        stopped = true;
        clearTimeout(retry);
        const old = link;
        link = null;
        up = false;
        if (old) {
          old.onclose = null;
          old.close();
        }
      },
      leave() {
        if (link) link.send({ t: 'bye' });
        guest.stop();
      },
    };
    return guest;
  }

  // ---- the other squirrel, smoothly ----

  // Each position comes stamped with the other phone's clock (`s`). How far
  // that clock is behind this phone's is worked out from the quickest recent
  // arrivals, so a message that comes late is still placed when it was sent.
  // The squirrel is drawn BEHIND seconds in the past, between the two
  // positions either side of that moment; if none has come since, it carries
  // on along its last step for a moment, then waits.
  function follower() {
    let samples = [];   // { s, x, y, facing, moving, gap }, oldest first
    const placed = (spot) => ({ x: spot.x, y: spot.y, facing: spot.facing, moving: spot.moving });
    return {
      // A position as it arrives, with this phone's clock (seconds).
      push(spot, now) {
        const last = samples[samples.length - 1];
        if (last && spot.s <= last.s) return;   // older than one already here
        samples.push({ s: spot.s, x: spot.x, y: spot.y, facing: spot.facing, moving: spot.moving, gap: now - spot.s });
        if (samples.length > 60) samples.shift();
      },
      // Forget them all (a new round, or after a pause, when the clocks moved on unevenly).
      clear() {
        samples = [];
      },
      latest: () => (samples.length ? placed(samples[samples.length - 1]) : null),
      // Where to draw it, at this phone's time `now`.
      at(now) {
        if (!samples.length) return null;
        const gap = Math.min(...samples.slice(-40).map((sample) => sample.gap));
        const when = now - gap - BEHIND;
        let i = samples.length - 1;
        while (i > 0 && samples[i].s > when) i--;
        const a = samples[i];
        const b = samples[i + 1];
        if (when <= a.s) return placed(a);
        if (!b) {
          const before = samples[i - 1];
          if (!before || !a.moving || a.s - before.s <= 0) return placed(a);
          const ahead = Math.min(when - a.s, CARRY_ON) / (a.s - before.s);
          return { x: a.x + (a.x - before.x) * ahead, y: a.y + (a.y - before.y) * ahead, facing: a.facing, moving: a.moving };
        }
        const share = (when - a.s) / (b.s - a.s);
        return {
          x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share,
          facing: share < 0.5 ? a.facing : b.facing, moving: a.moving || b.moving,
        };
      },
    };
  }

  return { NAME_LENGTH, cleanName, cleanSpot, deniedText, createHost, createGuest, follower };
})();
