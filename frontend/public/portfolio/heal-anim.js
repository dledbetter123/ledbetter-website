// Plays the heal replays on the Self-Healing Automation page: a fake app on the left, the agent on
// the right. Each .heal-anim holds one replay and its steps (built by scripts/heal_example/build.py);
// the replay cards pick which one shows. The shown replay plays once when scrolled into view, never
// on its own under reduced motion. ?hs=<id>&ha=N opens replay <id> at step N, and
// window.healReplay lets scripts/heal_example/record.py capture each step for the GIFs.
(() => {
  const roots = [...document.querySelectorAll('.heal-anim')];
  if (!roots.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setup = (root) => {
    const steps = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
    const phone = root.querySelector('.phone');
    const svg = phone.querySelector('svg');
    const tap = svg.querySelector('.ha-tapring');
    const hl = svg.querySelector('.ha-hlbox');
    const hud = svg.querySelector('.ha-hud');
    const t1 = svg.querySelector('.ha-t1');
    const t2 = svg.querySelector('.ha-t2');
    const lines = root.querySelectorAll('[data-line]');
    const items = root.querySelectorAll('.ha-log li');
    const log = root.querySelector('.ha-log');
    const status = root.querySelector('.ha-status');
    const count = root.querySelector('.ha-count');
    const scrub = root.querySelector('.ha-scrub');
    const playBtn = root.querySelector('[data-act="play"]');
    let at = 0;
    let timer = null;

    const show = (n) => {
      at = n;
      const s = steps[n];
      phone.dataset.screen = s.screen;
      phone.dataset.overlay = s.overlay || '';
      phone.classList.toggle('toast', !!s.toast);
      if (s.toast) { t1.textContent = s.toast[0]; t2.textContent = s.toast[1]; }
      root.classList.toggle('healed', s.code === 'new');
      const marks = {};
      for (let i = 0; i <= n; i += 1) {
        if (steps[i].clear) Object.keys(marks).forEach((k) => delete marks[k]);
        (steps[i].marks || []).forEach(([line, kind]) => { marks[line] = kind; });
      }
      lines.forEach((l) => {
        l.classList.toggle('cur', l.dataset.line === String(s.line));
        l.dataset.mark = marks[l.dataset.line] || '';
      });
      items.forEach((li, i) => { li.hidden = i > n; li.classList.toggle('now', i === n); });
      log.scrollTop = log.scrollHeight;
      status.textContent = s.status;
      hud.textContent = s.hud || '';
      hud.dataset.kind = s.kind;
      count.textContent = `${n + 1} / ${steps.length}`;
      scrub.value = n + 1;
      if (s.hl) {
        const [x, y, w, h] = s.hl;
        hl.setAttribute('x', x); hl.setAttribute('y', y);
        hl.setAttribute('width', w); hl.setAttribute('height', h);
        hl.style.setProperty('--c', `var(--${s.hlc || 'green'})`);
        hl.style.display = '';
      } else {
        hl.style.display = 'none';
      }
      tap.classList.remove('go');
      if (s.tap) {
        tap.setAttribute('cx', s.tap[0]); tap.setAttribute('cy', s.tap[1]);
        void tap.getBBox();
        tap.classList.add('go');
      }
    };

    const stop = () => {
      clearTimeout(timer);
      timer = null;
      playBtn.textContent = at === steps.length - 1 ? 'Replay' : 'Play';
    };
    const run = () => {
      timer = setTimeout(() => {
        if (at >= steps.length - 1) return stop();
        show(at + 1);
        run();
      }, steps[at].ms);
    };
    const play = () => {
      if (timer) return stop();
      if (at >= steps.length - 1) show(0);
      playBtn.textContent = 'Pause';
      run();
    };
    const go = (n) => { stop(); show(Math.max(0, Math.min(n, steps.length - 1))); stop(); };

    playBtn.addEventListener('click', play);
    root.querySelector('[data-act="step"]').addEventListener('click', () => go(at + 1));
    root.querySelector('[data-act="back"]').addEventListener('click', () => go(at - 1));
    scrub.addEventListener('input', () => go(Number(scrub.value) - 1));
    go(0);
    return { root, id: root.id.replace(/^heal-/, ''), steps, show: go, stop, play, at: () => at };
  };

  const players = roots.map(setup);
  const cards = [...document.querySelectorAll('.replay-card')];
  const select = (id, { autoplay = false, scroll = false } = {}) => {
    const p = players.find((x) => x.id === id) || players[0];
    players.forEach((x) => { if (x !== p) { x.stop(); x.root.hidden = true; } });
    p.root.hidden = false;
    cards.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.target === p.root.id)));
    p.show(0);
    if (scroll) p.root.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    if (autoplay && !reduce) p.play();
    return p;
  };
  cards.forEach((c) => c.addEventListener('click', () => select(c.dataset.target.replace(/^heal-/, ''), { autoplay: true, scroll: true })));

  window.healReplay = {
    ids: players.map((p) => p.id),
    select: (id) => select(id),
    show: (id, n) => { const p = select(id); p.show(n); return p.steps[n]; },
    steps: (id) => players.find((p) => p.id === id).steps,
  };

  const q = new URLSearchParams(window.location.search);
  const asked = Number(q.get('ha'));
  if (q.get('hs') || asked) {
    const p = select(q.get('hs') || players[0].id);
    if (Number.isInteger(asked) && asked > 0 && asked <= p.steps.length) p.show(asked - 1);
    return;
  }
  if (reduce || !('IntersectionObserver' in window)) return;
  const seen = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      seen.disconnect();
      const p = players.find((x) => !x.root.hidden);
      if (p && p.at() === 0) p.play();
    }
  }, { threshold: 0.5 });
  seen.observe(players[0].root);
})();
