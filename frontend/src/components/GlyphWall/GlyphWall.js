// ledbetter-website/frontend/src/components/GlyphWall/GlyphWall.js

import React, { useEffect, useRef } from 'react';
import { SCRAMBLE_CHARS } from '../../lib/scramble';
import './GlyphWall.css';

// The SPA-wide background: a faint wall of green glyphs (the same Greek + Arabic pool
// the text scrambles use) that flip in place, plus a bright band that rolls left to
// right across the wall whenever the page scrolls. Drawn on one fixed canvas at the
// back of the SPA (z-index 0, under .content-layer).
//
// Only cells whose brightness actually changed are repainted each frame: at rest that
// is the handful of cells flipping, and during a sweep it is the strip of cells under
// the band. The wall is never fully redrawn except on resize.

const GLYPHS = Array.from(SCRAMBLE_CHARS);

const CELL_W = 16;          // grid pitch, CSS px
const CELL_H = 20;
const FONT = '14px "Courier New", monospace';

const BASE_MIN = 0.04;      // resting alpha range per cell: "faint", with some texture
const BASE_MAX = 0.13;
const FLIP_PERIOD_MS = 4000; // mean time between flips for any one cell
const FLIP_GLOW = 0.16;     // a flipped glyph lands this much brighter, then decays
const GLOW_DECAY_MS = 500;

const SWEEP_MS = 1400;      // time for one band to cross the screen
const SWEEP_PEAK = 0.6;     // alpha the band adds at its centre
const SWEEP_SLANT = 0.47;   // tan(25deg): leans "/" like the chat button's 115deg sheen
const MAX_LEAN = 0.3;       // ...but never leans further than 30% of the width (phones)
const RETRIGGER_AT = 0.5;   // while scrolling, a new band starts once the last is halfway
const SPARKLE = 0.06;       // per-frame chance a glyph inside the band's core flips

const IDLE_FRAME_MS = 33;   // ~30fps when only flips are animating

// One fillStyle per brightness level (0..100). Dim glyphs are the site's neon green;
// bright ones (inside the band) whiten toward the same mint as the chat sheen.
const STYLES = Array.from({ length: 101 }, (_, level) => {
  const v = level / 100;
  const t = Math.min(1, Math.max(0, (v - 0.2) / 0.5));
  const r = Math.round(57 + (200 - 57) * t);
  const b = Math.round(20 + (205 - 20) * t);
  return `rgba(${r}, 255, ${b}, ${v.toFixed(2)})`;
});

const easeInOut = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);

const pickGlyph = (prev) => {
  let g;
  do {
    g = (Math.random() * GLYPHS.length) | 0;
  } while (g === prev);
  return g;
};

const GlyphWall = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let n = 0;
    let glyph;   // Uint16Array: index into GLYPHS
    let base;    // Uint8Array: resting brightness level
    let glow;    // Float32Array: flip afterglow, decays to 0
    let drawn;   // Uint8Array: level the cell was last painted at
    let hot;     // Uint8Array: 1 while the cell is on the hot list
    let hotList = [];
    const sweeps = [];
    let flipAcc = 0;
    let last = 0;
    let lastWork = 0;
    let raf = 0;

    const paint = (i, level) => {
      const c = i % cols;
      const r = (i / cols) | 0;
      const x = c * CELL_W;
      const y = r * CELL_H;
      ctx.clearRect(x, y, CELL_W, CELL_H);
      ctx.fillStyle = STYLES[level];
      ctx.fillText(GLYPHS[glyph[i]], x + CELL_W / 2, y + CELL_H / 2);
      drawn[i] = level;
    };

    const markHot = (i) => {
      if (!hot[i]) {
        hot[i] = 1;
        hotList.push(i);
      }
    };

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === W && h === H && n) return;
      W = w;
      H = h;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      cols = Math.ceil(W / CELL_W);
      rows = Math.ceil(H / CELL_H);
      n = cols * rows;
      glyph = new Uint16Array(n);
      base = new Uint8Array(n);
      glow = new Float32Array(n);
      drawn = new Uint8Array(n);
      hot = new Uint8Array(n);
      hotList = [];
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < n; i += 1) {
        glyph[i] = pickGlyph(-1);
        base[i] = Math.round(100 * (BASE_MIN + Math.random() * (BASE_MAX - BASE_MIN)));
        paint(i, base[i]);
      }
    };

    // Brightness the band adds at (x, y) for every sweep in flight.
    const bandAt = (x, y, now, sigma) => {
      let add = 0;
      for (let s = 0; s < sweeps.length; s += 1) {
        const dx = x - sweeps[s].lineX(y, now);
        add += SWEEP_PEAK * Math.exp(-(dx * dx) / (2 * sigma * sigma));
      }
      return add;
    };

    const startSweep = (now) => {
      const sigma = Math.max(36, W * 0.035);
      const slant = Math.min(SWEEP_SLANT, (MAX_LEAN * W) / H);
      const lean = (H / 2) * slant;
      const from = -3 * sigma - lean;
      const to = W + 3 * sigma + lean;
      sweeps.push({
        start: now,
        progress: (t) => Math.min(1, (t - now) / SWEEP_MS),
        lineX(y, t) {
          return from + (to - from) * easeInOut(this.progress(t)) - (y - H / 2) * slant;
        },
      });
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!sweeps.length && now - lastWork < IDLE_FRAME_MS) return;
      const dt = Math.min(64, now - (last || now));
      last = now;
      lastWork = now;

      // Random flips across the whole wall.
      flipAcc += (n * dt) / FLIP_PERIOD_MS;
      let k = flipAcc | 0;
      flipAcc -= k;
      while (k > 0) {
        const i = (Math.random() * n) | 0;
        glyph[i] = pickGlyph(glyph[i]);
        glow[i] = FLIP_GLOW;
        drawn[i] = 255; // force a repaint: the glyph changed even if the level didn't
        markHot(i);
        k -= 1;
      }

      // Cells under any band in flight join the hot list.
      while (sweeps.length && sweeps[0].progress(now) >= 1) sweeps.shift();
      const sigma = Math.max(36, W * 0.035);
      for (let s = 0; s < sweeps.length; s += 1) {
        for (let r = 0; r < rows; r += 1) {
          const lx = sweeps[s].lineX(r * CELL_H + CELL_H / 2, now);
          const c0 = Math.max(0, Math.floor((lx - 3 * sigma) / CELL_W));
          const c1 = Math.min(cols - 1, Math.ceil((lx + 3 * sigma) / CELL_W));
          for (let c = c0; c <= c1; c += 1) markHot(r * cols + c);
        }
      }

      // Repaint hot cells whose level changed; keep only those still above rest.
      const decay = (dt / GLOW_DECAY_MS) * FLIP_GLOW;
      const next = [];
      for (let j = 0; j < hotList.length; j += 1) {
        const i = hotList[j];
        if (glow[i] > 0) glow[i] = Math.max(0, glow[i] - decay);
        let add = glow[i];
        if (sweeps.length) {
          const x = (i % cols) * CELL_W + CELL_W / 2;
          const y = ((i / cols) | 0) * CELL_H + CELL_H / 2;
          const band = bandAt(x, y, now, sigma);
          if (band > SWEEP_PEAK * 0.5 && Math.random() < SPARKLE) {
            glyph[i] = pickGlyph(glyph[i]);
            drawn[i] = 255;
          }
          add += band;
        }
        const level = Math.min(100, base[i] + Math.round(add * 100));
        if (level !== drawn[i]) paint(i, level);
        if (level > base[i]) next.push(i);
        else hot[i] = 0;
      }
      hotList = next;
    };

    const onScroll = () => {
      const now = performance.now();
      const newest = sweeps[sweeps.length - 1];
      if (!newest || newest.progress(now) >= RETRIGGER_AT) startSweep(now);
    };

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 150);
    };

    build();
    window.addEventListener('resize', onResize);
    if (!reduce) {
      raf = requestAnimationFrame(frame);
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return <canvas ref={canvasRef} className="glyphWall" aria-hidden="true" />;
};

export default GlyphWall;
