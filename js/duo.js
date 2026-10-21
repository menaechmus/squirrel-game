// Friends on their own phones (1.13; up to four players since 1.14): who is
// playing, the messages between the host's phone and each of the others, and
// the other squirrels drawn smoothly from the positions they send. The host's
// phone keeps the race (the acorns, the clock, who got what); game.js does
// that. This file only checks who sent what and passes it on, as
// WordGridGame's wifi.js does. Each guest is linked to the host's phone only,
// so the host passes each one's position on to the rest. The links come from
// net.js.
//
// Messages are objects { t, ... }:
//   guest to host   hello { name, token, version }, me { s, x, y, f, m, e, h },
//                   view { w, h }, ready, took { id, s }, golden { s }, pause, resume, bye
//   host to guest   lobby { seat, players }, round { ... },
//                   tick { s, x, y, f, m, time, p, b, w, q }, pos { seat, s, x, y, f, m },
//                   taken { id, by }, grown { id, x, y }, golden { by },
//                   end { hauls, time }, denied { why, version }, closed { why }
// A seat is 0 for the host and 1 to 3 for the others, taken in the order they
// come; each seat has its own squirrel's coat. `s` is the sender's clock in
// seconds, so the other side can place each position in time however late it
// arrives, and tell which squirrel reached an acorn first. The guest's `e`
// and `h` hand back the host's latest `s` and how long ago it came, so the
// host can time the round trip.

const Duo = (() => {
  const MAX_PLAYERS = 4;
  const NAME_LENGTH = 12;
  const BEHIND = 0.1;      // the other squirrels are drawn this many seconds in the past
  const CARRY_ON = 0.15;   // and carried on along their way at most this long when messages stall
  const FACINGS = ['up', 'down', 'left', 'right'];

  // A name as typed: single spaces, trimmed, no longer than the box allows.
  const cleanName = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH);

  // "Sam" a second time becomes "Sam 2", so that every name on the screen is
  // one person (WordGridGame's way).
  function uniqueName(name, taken) {
    const used = new Set(taken.map((other) => other.toLowerCase()));
    if (!used.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, NAME_LENGTH - String(n).length - 1)} ${n}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }

  const isNumber = (value) => typeof value === 'number' && isFinite(value);

  // A position from another phone, rebuilt from only what it should hold, or null.
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
    if (why === 'version') return `This phone has version ${ours} of the game and the host's has ${version}. Reload the page on the older one, then join again.`;
    if (why === 'full') return 'That game already has four players.';
    return 'Type your name first.';
  }

  // ---- the host ----

  // The host keeps the seats: its own (0) and up to three others, each taking
  // the lowest seat free. onjoin({ seat, name, back }) hears a phone arrive, or
  // come back after its link dropped; onleave({ seat, name, left }) hears one
  // go, `left` true if it said goodbye rather than losing its link;
  // onmessage(seat, message) hears what each sends, cleaned (see
  // cleanFromGuest). Before a game starts a phone that goes loses its seat;
  // once one has started, a seat whose phone dropped out is kept for it, and
  // the phone is known again by the token its tab keeps. One that says
  // goodbye gives its seat up.
  function createHost({ name, version, onjoin = () => {}, onleave = () => {}, onmessage = () => {} }) {
    const seats = [{ name, token: null, link: null }];   // { name, token, link } or null
    while (seats.length < MAX_PLAYERS) seats.push(null);
    let started = false;
    let ended = false;

    const seatOf = (link) => seats.findIndex((seat, i) => i > 0 && seat && seat.link === link);

    // The guest hangs up once it has read why; this is in case it does not.
    function deny(link, why) {
      link.send({ t: 'denied', why, version });
      setTimeout(() => link.close(), 3000);
    }

    function hello(link, message) {
      const who = cleanName(message.name);
      const token = typeof message.token === 'string' ? message.token.slice(0, 40) : '';
      if (message.version !== version) return deny(link, 'version');
      if (!who || !token) return deny(link, 'name');
      let seat = seats.findIndex((other, i) => i > 0 && other && other.token === token);
      const back = seat > 0;
      if (!back) {
        seat = seats.findIndex((other, i) => i > 0 && !other);
        if (seat < 0) return deny(link, 'full');
        seats[seat] = { name: uniqueName(who, seats.filter(Boolean).map((other) => other.name)), token, link: null };
      }
      const old = seats[seat].link;
      seats[seat].link = link;
      if (old && old !== link) {
        old.onclose = null;
        old.close();
      }
      link.onmessage = (next) => heard(link, next);
      link.onclose = () => dropped(link, false);
      onjoin({ seat, name: seats[seat].name, back });
    }

    function heard(link, message) {
      const seat = seatOf(link);
      if (seat < 0 || ended) return;
      if (message.t === 'bye') {
        link.onclose = null;
        link.close();
        dropped(link, true);
        return;
      }
      const clean = cleanFromGuest(message);
      if (clean) onmessage(seat, clean);
    }

    function dropped(link, left) {
      const seat = seatOf(link);
      if (seat < 0) return;
      const who = seats[seat].name;
      seats[seat].link = null;
      if (!started || left) seats[seat] = null;
      onleave({ seat, name: who, left });
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
      // Each seat as { name, here }, or null when nobody has it.
      players: () => seats.map((seat, i) => seat && { name: seat.name, here: i === 0 || Boolean(seat.link) }),
      // The seats whose phones are linked now.
      linked: () => seats.map((seat, i) => (i > 0 && seat && seat.link ? i : 0)).filter(Boolean),
      // Whether a game is on: from then on a phone that drops keeps its seat.
      setStarted(on) {
        started = on;
      },
      // To every phone linked, to the one in `seat`, or to all but that one.
      send(message) {
        for (const seat of seats) if (seat && seat.link) seat.link.send(message);
      },
      sendTo(seat, message) {
        const held = seats[seat];
        if (seat > 0 && held && held.link) held.link.send(message);
      },
      sendOthers(seat, message) {
        seats.forEach((held, i) => {
          if (i !== seat && held && held.link) held.link.send(message);
        });
      },
      // Who sits where, to every phone, each told its own seat.
      sendLobby() {
        const players = host.players();
        seats.forEach((held, i) => {
          if (held && held.link) held.link.send({ t: 'lobby', seat: i, players });
        });
      },
      // Ends the game for everyone.
      close(why = 'ended') {
        ended = true;
        for (const seat of seats) {
          const link = seat && seat.link;
          if (!link) continue;
          seat.link = null;
          link.onclose = null;
          link.send({ t: 'closed', why });
          setTimeout(() => link.close(), 500);
        }
      },
    };
    return host;
  }

  // ---- a guest ----

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
        answered(new Error(message.t === 'denied' ? deniedText(message, version) : 'The host ended the game.'));
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
        if (waiting) answered(new Error('Lost touch with the host. Try again.'));
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

  // ---- another squirrel, smoothly ----

  // Each position comes stamped with the sending phone's clock (`s`). How far
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

  return { MAX_PLAYERS, NAME_LENGTH, cleanName, cleanSpot, deniedText, createHost, createGuest, follower };
})();
