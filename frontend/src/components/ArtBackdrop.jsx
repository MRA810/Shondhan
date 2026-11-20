import { useEffect, useRef, useState } from "react";
import "./ArtBackdrop.css";

/*
  Background artwork for the report pages (start page → steps → signup).

  Desktop (mouse): a random set of the pictures, random sizes, places and angles. Each one wanders slowly
  around the screen, slowly zooms in and out, and after a random time fades away while another random
  picture fades in somewhere else. When the cursor comes near, a picture tilts and glides away from it. They are decoration only:
  no clicks, hidden from screen readers. Wherever they pass behind a text box, the box blurs them
  (see .artpage in styles.css), so text stays sharp and readable.

  Phone / tablet (no mouse): a slow full-screen slideshow behind the boxes, in random order. Each
  picture stays 5 s and cross-fades into the next; one slowly zooms in, the next slowly zooms out.

  "Reduce motion" in the device settings: pictures stay still (desktop) or only fade (phone).
*/

const ART = [
  ["home1.jpg", 756 / 1100], ["home2.jpg", 738 / 1100], ["home3.jpg", 1100 / 859],
  ["home4.jpg", 1100 / 886], ["home5.jpg", 1100 / 886], ["home6.jpg", 614 / 1100],
  ["home7.jpg", 1], ["home8.jpg", 1], ["home9.jpg", 1100 / 614],
].map(([file, ratio]) => ({ src: `/art/${file}`, ratio }));

const SLIDE_MS = 5000;      // each picture stays 5 seconds
const REPEL_RADIUS = 280;   // px: how close the cursor must come
const REPEL_MAX = 70;       // px: how far a picture glides away
const TILT_MAX = 16;        // degrees
const EASE = 0.035;         // smaller = slower, softer movement

const rand = (a, b) => a + Math.random() * (b - a);
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function useMedia(query) {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [query]);
  return on;
}

export default function ArtBackdrop() {
  const phone = useMedia("(max-width: 760px), (hover: none)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  return phone ? <Slideshow still={still} /> : <Floating still={still} />;
}

// ---------- desktop ----------
// Each picture lives a random time: it fades in at a random place, wanders slowly towards random points,
// slowly zooms in and out, then fades away and another random picture appears somewhere else.

const LIFE = [9000, 20000];      // ms a picture stays
const FADE = 1800;               // ms to appear / disappear (matches the CSS)

function slotCount(w) { return w >= 1500 ? 7 : w >= 1100 ? 6 : 4; }

function newCard(w, h, avoid, delay = 0) {
  const free = ART.filter((a) => !avoid.includes(a.src));
  const art = free[Math.floor(Math.random() * free.length)] || ART[0];
  const base = Math.max(150, Math.min(260, w * 0.13));
  const cw = base * rand(0.75, 1.3), ch = cw / art.ratio;
  const pick = () => ({ x: rand(-cw * 0.1, w - cw * 0.9), y: rand(-ch * 0.1, h - ch * 0.85) });
  const p = pick(), t = pick();
  return {
    id: Math.random().toString(36).slice(2), src: art.src, w: cw, h: ch, rot: rand(-9, 9),
    sim: { x: p.x, y: p.y, tx: t.x, ty: t.y, s: rand(0.85, 1.1), ts: rand(0.8, 1.2),
           vx: 0, vy: 0, ox: 0, oy: 0, rx: 0, ry: 0, retarget: 0, rescale: 0, pick },
    appearAt: performance.now() + delay,
    dieAt: performance.now() + delay + rand(LIFE[0], LIFE[1]),
  };
}

function Floating({ still }) {
  const size = () => [window.innerWidth, window.innerHeight];
  const [cards, setCards] = useState(() => {
    const [w, h] = size(); const list = [];
    for (let i = 0; i < slotCount(w); i++) list.push(newCard(w, h, list.map((c) => c.src), i * 450));
    return list;
  });
  const [gone, setGone] = useState({});          // id -> fading out
  const [born, setBorn] = useState({});          // id -> faded in
  const outer = useRef({}), inner = useRef({});
  const live = useRef(cards);
  live.current = cards;

  // fade each new picture in (after its small start delay)
  useEffect(() => {
    const now = performance.now();
    const timers = cards.filter((c) => !born[c.id]).map((c) =>
      setTimeout(() => setBorn((b) => ({ ...b, [c.id]: true })), Math.max(40, c.appearAt - now)));
    return () => timers.forEach(clearTimeout);
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  // lifecycle: after its life a picture fades out, then a different random one takes its slot
  useEffect(() => {
    if (still) return undefined;
    // fixed times per picture, so replacing one never restarts the others' clocks
    const now = performance.now(), timers = [];
    cards.forEach((c) => {
      timers.push(setTimeout(() => setGone((g) => (g[c.id] ? g : { ...g, [c.id]: true })), Math.max(0, c.dieAt - now)));
      timers.push(setTimeout(() => {
        const [w, h] = size();
        setCards((list) => list.map((x) => (x.id === c.id ? newCard(w, h, list.map((y) => y.src), rand(200, 1500)) : x)));
      }, Math.max(0, c.dieAt + FADE - now)));
    });
    return () => timers.forEach(clearTimeout);
  }, [cards, still]); // eslint-disable-line react-hooks/exhaustive-deps

  // a much smaller or bigger window: start again
  useEffect(() => {
    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => {
      const [w, h] = size(); const list = [];
      for (let i = 0; i < slotCount(w); i++) list.push(newCard(w, h, list.map((c) => c.src), i * 300));
      setCards(list);
    }, 500); };
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, []);

  // movement: wander + zoom (outer), push away and tilt from the cursor (inner)
  useEffect(() => {
    const mouse = { x: -9999, y: -9999 };
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = mouse.y = -9999; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    // text that stands directly on the background (welcome page): a picture passing behind it softly
    // blurs and fades as a whole, so the words stay readable. Text inside boxes is handled by the boxes.
    let zones = [], zonesAt = 0;
    const readZones = () => {
      zones = [...document.querySelectorAll(".artpage .halo > *")].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - 12, t: r.top - 8, r: r.right + 12, b: r.bottom + 8 };
      }).filter((z) => z.r > z.l);
    };
    let raf, last = performance.now();
    const tick = (now) => {
      if (now > zonesAt) { readZones(); zonesAt = now + 400; }
      const dt = Math.min(64, now - last); last = now;
      live.current.forEach((c) => {
        const s = c.sim, o = outer.current[c.id], n = inner.current[c.id];
        if (!o || !n) return;
        if (!still) {
          // wander: steer gently towards a random point, pick a new one now and then
          if (now > s.retarget || Math.hypot(s.tx - s.x, s.ty - s.y) < 30) {
            const p = s.pick(); s.tx = p.x; s.ty = p.y; s.retarget = now + rand(6000, 14000);
          }
          const ax = (s.tx - s.x) * 0.0000045 * dt, ay = (s.ty - s.y) * 0.0000045 * dt;
          s.vx = (s.vx + ax) * 0.985; s.vy = (s.vy + ay) * 0.985;
          const sp = Math.hypot(s.vx, s.vy), max = 0.028;            // px per ms (~28 px/s at most)
          if (sp > max) { s.vx *= max / sp; s.vy *= max / sp; }
          s.x += s.vx * dt; s.y += s.vy * dt;
          // zoom: drift towards a random size, choose a new one every few seconds
          if (now > s.rescale) { s.ts = rand(0.78, 1.22); s.rescale = now + rand(4000, 9000); }
          s.s += (s.ts - s.s) * 0.0006 * dt;
          // cursor: glide away and tilt
          const cx = s.x + c.w / 2 + s.ox, cy = s.y + c.h / 2 + s.oy;
          const dx = cx - mouse.x, dy = cy - mouse.y, dist = Math.hypot(dx, dy) || 1;
          let tx = 0, ty = 0, trx = 0, try_ = 0;
          const R = REPEL_RADIUS * s.s;
          if (dist < R) {
            const push = (1 - dist / R) ** 1.4;
            tx = (dx / dist) * REPEL_MAX * push; ty = (dy / dist) * REPEL_MAX * push;
            trx = Math.max(-1, Math.min(1, dy / (c.h / 2 + 60))) * TILT_MAX * push * 1.6;
            try_ = -Math.max(-1, Math.min(1, dx / (c.w / 2 + 60))) * TILT_MAX * push * 1.6;
          }
          s.ox += (tx - s.ox) * EASE; s.oy += (ty - s.oy) * EASE;
          s.rx += (Math.max(-TILT_MAX, Math.min(TILT_MAX, trx)) - s.rx) * EASE * 1.4;
          s.ry += (Math.max(-TILT_MAX, Math.min(TILT_MAX, try_)) - s.ry) * EASE * 1.4;
        }
        o.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) scale(${s.s.toFixed(3)})`;
        const cw = c.w * s.s, ch = c.h * s.s;
        const L = s.x + s.ox + (c.w - cw) / 2, T = s.y + s.oy + (c.h - ch) / 2;
        const under = zones.some((z) => L < z.r && L + cw > z.l && T < z.b && T + ch > z.t);
        if (under !== s.under) { s.under = under; o.classList.toggle("under", under); }
        n.style.transform = `translate3d(${s.ox.toFixed(1)}px, ${s.oy.toFixed(1)}px, 0) perspective(900px) rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg) rotate(${c.rot}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [still]);

  return (
    <div className="artbg" aria-hidden="true">
      {cards.map((c) => (
        <div key={c.id} className="artcard" style={{ width: c.w }} ref={(el) => { outer.current[c.id] = el; }}>
          <div className={`artfade ${born[c.id] && !gone[c.id] ? "in" : ""}`}>
            <div className="artmove" ref={(el) => { inner.current[c.id] = el; }}>
              <img src={c.src} alt="" draggable="false" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- phone ----------

function Slideshow({ still }) {
  const order = useRef(shuffle(ART));
  const pos = useRef(0);
  const n = useRef(0);
  const [slides, setSlides] = useState(() => [{ id: 0, src: order.current[0].src, zoom: "in" }]);

  useEffect(() => {
    const next = () => {
      pos.current += 1;
      if (pos.current >= order.current.length) {   // new random round, never the same picture twice in a row
        const last = order.current[order.current.length - 1];
        let o = shuffle(ART);
        if (o[0] === last) o = [...o.slice(1), o[0]];
        order.current = o;
        pos.current = 0;
      }
      n.current += 1;
      const src = order.current[pos.current].src;
      const pre = new Image(); pre.src = order.current[(pos.current + 1) % order.current.length].src;
      setSlides((prev) => [
        ...prev.slice(-1).map((s) => ({ ...s, leaving: true })),
        { id: n.current, src, zoom: n.current % 2 ? "out" : "in" },
      ]);
    };
    const t = setInterval(next, SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="artshow" aria-hidden="true">
      {slides.map((s) => (
        <div key={s.id}
             className={`slide ${still ? "" : `kb-${s.zoom}`} ${s.leaving ? "leave" : "enter"}`}
             style={{ backgroundImage: `url(${s.src})` }} />
      ))}
    </div>
  );
}
