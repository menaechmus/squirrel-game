// Connections between two phones (1.13). One phone opens a room under a
// four-letter code and the other joins it. Each connection is a *link* that
// carries plain objects both ways as JSON text. Nothing here knows the game.
// It is WordGridGame's net.js, as a classic script.
//
// The phones find each other through PeerJS (js/vendor/peerjs.min.js, MIT
// licence): its free cloud server passes the connection details between
// them, and the messages then go straight from phone to phone over WebRTC
// (or through PeerJS's free relay when a direct link is blocked). The library
// is loaded the first time a room is opened or joined. With ?net=test in the
// address, rooms run through the page holding the game in a frame
// (local-tests/two.html), which can delay the messages like a network.

const Net = (() => {
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O, too like 1 and 0
  const CODE_LENGTH = 4;
  const PREFIX = 'squirrelgame-menaechmus-';   // keeps our ids apart on the shared server
  const PING_MS = 2000;    // each side says something at least this often
  const LOST_MS = 8000;    // and a link that hears nothing for this long is lost
  const JOIN_MS = 20000;   // a join that has not connected by then fails
  const LIBRARY = 'js/vendor/peerjs.min.js';

  const testing = new URLSearchParams(location.search).get('net') === 'test';

  const newCode = (random = Math.random) => Array.from({ length: CODE_LENGTH }, () => LETTERS[Math.floor(random() * LETTERS.length)]).join('');

  // What someone typed, as a code: capitals only, the right length at most.
  const cleanCode = (text) => String(text).toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);

  const parse = (text) => {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  };

  // Every link still open, so that leaving the page hangs them all up at once
  // and the other phone hears of it straight away.
  const live = new Set();
  window.addEventListener('pagehide', () => {
    for (const link of [...live]) link.close();
  });

  // A link over any carrier: `post(text)` sends, `end()` hangs up. The owner
  // sets onmessage(message) and onclose(). `receive(text)` is the carrier's
  // way in. Both sides ping, so a link that goes quiet is closed rather than
  // left hanging.
  function makeLink(post, end, { ping = true } = {}) {
    let heard = Date.now();
    let timer = 0;
    const link = {
      open: true,
      onmessage: null,
      onclose: null,
      send(message) {
        if (link.open) post(JSON.stringify(message));
      },
      receive(text) {
        heard = Date.now();
        const message = parse(text);
        if (link.open && message && message.t !== 'ping' && link.onmessage) link.onmessage(message);
      },
      close() {
        if (!link.open) return;
        link.open = false;
        clearInterval(timer);
        live.delete(link);
        end();
        if (link.onclose) link.onclose();
      },
    };
    if (ping) {
      timer = setInterval(() => {
        if (Date.now() - heard > LOST_MS) link.close();
        else post('{"t":"ping"}');
      }, PING_MS);
    }
    live.add(link);
    return link;
  }

  // Two links joined to each other, for tests. Messages arrive a moment after
  // they are sent, as they would over a network.
  function linkPair() {
    let a = null;
    let b = null;
    const later = (fn) => setTimeout(fn, 0);
    a = makeLink((text) => later(() => b.open && b.receive(text)), () => later(() => b.close()), { ping: false });
    b = makeLink((text) => later(() => a.open && a.receive(text)), () => later(() => a.close()), { ping: false });
    return [a, b];
  }

  const failure = (message) => Object.assign(new Error(message), { friendly: true });
  const NO_GAME = 'No game has that code. Check the letters on the other phone.';
  const NO_SERVER = 'Could not reach the server that connects phones. Check the internet connection.';
  const NO_HOST = 'Could not reach the other phone. Check the internet connection on both, and try again.';

  // Opens a room for the other phone to join, under a new code. onlink(link)
  // hears of each phone that joins. Resolves to { code, close() } once it can
  // be found.
  async function openRoom({ code = null, onlink }) {
    const attempts = code ? 3 : 5;
    for (let attempt = 1; ; attempt++) {
      const tried = code || newCode();
      try {
        return await (testing ? testRoom : peerRoom)(tried, onlink);
      } catch (error) {
        if (error.taken && attempt < attempts) continue;
        throw error.friendly ? error : failure(error.taken ? 'That code is still in use. Try again in a minute.' : NO_SERVER);
      }
    }
  }

  // Joins the room with `code`. Resolves to a link once connected, or rejects
  // with an error whose message can be shown as it is.
  function joinRoom(code) {
    return (testing ? testJoin : peerJoin)(code);
  }

  // ---- PeerJS ----

  let library = null;

  // A classic script, which leaves window.peerjs behind.
  function loadPeerJs() {
    if (!library) {
      library = new Promise((resolve, reject) => {
        if (window.peerjs && window.peerjs.Peer) {
          resolve(window.peerjs.Peer);
          return;
        }
        const script = document.createElement('script');
        script.src = LIBRARY;
        script.onload = () => (window.peerjs && window.peerjs.Peer ? resolve(window.peerjs.Peer) : reject(failure(NO_SERVER)));
        script.onerror = () => {
          library = null;
          reject(failure('The connection code did not load. Check the internet connection, then reload.'));
        };
        document.head.append(script);
      });
    }
    return library;
  }

  const peerFailure = (error) => {
    const type = error && error.type;
    if (type === 'unavailable-id') return Object.assign(new Error(error.message), { taken: true });
    if (type === 'peer-unavailable') return failure(NO_GAME);
    if (type === 'browser-incompatible') return failure('This browser cannot connect phones. Try another, such as Chrome or Safari.');
    if (type === 'timeout') return failure(NO_HOST);
    return failure(NO_SERVER);
  };

  // Messages travel as text ("raw"), as in WordGridGame.
  function wire(conn, onclosed = () => {}) {
    const link = makeLink(
      (text) => conn.send(text),
      () => {
        conn.close();
        onclosed();
      },
    );
    conn.on('data', (text) => typeof text === 'string' && link.receive(text));
    conn.on('close', () => link.close());
    conn.on('error', () => link.close());
    return link;
  }

  async function peerRoom(code, onlink) {
    const Peer = await loadPeerJs();
    const peer = await new Promise((resolve, reject) => {
      const made = new Peer(PREFIX + code, { debug: 0 });
      const refused = (error) => {
        made.destroy();
        reject(peerFailure(error));
      };
      made.once('error', refused);
      made.once('open', () => {
        made.off('error', refused);
        resolve(made);
      });
    });
    peer.on('connection', (conn) => {
      if (conn.serialization !== 'raw') {
        conn.close();
        return;
      }
      conn.once('open', () => onlink(wire(conn)));
    });
    // Losing the server leaves a phone already joined connected, but one that
    // drops out could not find the game again: keep trying to get it back.
    let retry = 0;
    const reconnect = () => {
      clearTimeout(retry);
      retry = setTimeout(() => {
        if (peer.destroyed || !peer.disconnected) return;
        peer.reconnect();
        reconnect();
      }, 3000);
    };
    peer.on('disconnected', reconnect);
    peer.on('error', () => {
      if (peer.disconnected) reconnect();
    });
    return {
      code,
      close() {
        clearTimeout(retry);
        peer.destroy();
      },
    };
  }

  async function peerJoin(code) {
    const Peer = await loadPeerJs();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      let settled = false;
      let timer = 0;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        reject(peerFailure(error));
      };
      timer = setTimeout(() => fail({ type: 'timeout' }), JOIN_MS);
      peer.on('error', fail);
      peer.once('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        conn.once('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          peer.off('error', fail);
          peer.on('error', () => {});
          // The link is direct now; the server is not needed until the next join.
          peer.disconnect();
          resolve(wire(conn, () => peer.destroy()));
        });
      });
    });
  }

  // ---- the test page ----

  // In a frame of local-tests/two.html, every message goes up to that page,
  // which passes it to the other frame (after a delay of its choosing). Each
  // names who sent it and who it is for, as { net, from, to, code, text }.
  const someId = () => Math.random().toString(36).slice(2, 10);
  const tell = (data) => window.parent.postMessage(data, '*');
  const heard = new Set();   // what each room or join is listening for
  if (testing) {
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || !event.data || !event.data.net) return;
      for (const listener of [...heard]) listener(event.data);
    });
  }

  function testRoom(code, onlink) {
    return new Promise((resolve) => {
      const me = someId();
      const links = new Map();   // the guest's id -> link
      const listener = (data) => {
        if (data.code !== code || data.to !== me && data.net !== 'knock') return;
        if (data.net === 'knock') {
          const guest = data.from;
          const link = makeLink(
            (text) => tell({ net: 'msg', code, from: me, to: guest, text }),
            () => {
              links.delete(guest);
              tell({ net: 'close', code, from: me, to: guest });
            },
          );
          links.set(guest, link);
          tell({ net: 'welcome', code, from: me, to: guest });
          onlink(link);
        } else if (data.net === 'msg') {
          const link = links.get(data.from);
          if (link) link.receive(data.text);
        } else if (data.net === 'close') {
          const link = links.get(data.from);
          if (link) link.close();
        }
      };
      heard.add(listener);
      tell({ net: 'open', code, from: me });
      resolve({
        code,
        close() {
          for (const link of [...links.values()]) link.close();
          heard.delete(listener);
        },
      });
    });
  }

  function testJoin(code) {
    return new Promise((resolve, reject) => {
      const me = someId();
      let host = null;
      let link = null;
      const listener = (data) => {
        if (data.code !== code || data.to !== me) return;
        if (data.net === 'welcome' && !link) {
          clearTimeout(timer);
          host = data.from;
          link = makeLink(
            (text) => tell({ net: 'msg', code, from: me, to: host, text }),
            () => {
              tell({ net: 'close', code, from: me, to: host });
              heard.delete(listener);
            },
          );
          resolve(link);
        } else if (link && data.from === host) {
          if (data.net === 'msg') link.receive(data.text);
          else if (data.net === 'close') link.close();
        }
      };
      const timer = setTimeout(() => {
        heard.delete(listener);
        reject(failure(NO_GAME));
      }, 1500);
      heard.add(listener);
      tell({ net: 'knock', code, from: me });
    });
  }

  return { CODE_LENGTH, newCode, cleanCode, openRoom, joinRoom, linkPair, testing };
})();
