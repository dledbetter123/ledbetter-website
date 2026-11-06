// Plays the worked heal on the self-healing agent page: a fake app on the left, the agent on
// the right. The steps come from the page (built by scripts/heal_example/build.py). It starts
// when the player scrolls into view, never on its own under reduced motion, and ?ha=N opens
// step N directly.
(() => {
  const root = document.getElementById('heal-anim');
  const data = document.getElementById('ha-steps');
  if (!root || !data) return;
  const steps = JSON.parse(data.textContent);
  const phone = root.querySelector('.phone');
  const svg = phone.querySelector('svg');
  const tap = svg.querySelector('#ha-tap');
  const hl = svg.querySelector('#ha-hl');
  const lines = root.querySelectorAll('[data-line]');
  const items = root.querySelectorAll('.ha-log li');
  const log = root.querySelector('.ha-log');
  const status = root.querySelector('.ha-status');
  const count = root.querySelector('.ha-count');
  const playBtn = root.querySelector('[data-act="play"]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let at = 0;
  let timer = null;

  const show = (n) => {
    at = n;
    const s = steps[n];
    phone.dataset.screen = s.screen;
    phone.classList.toggle('toast', !!s.toast);
    root.classList.toggle('healed', s.code === 'new');
    lines.forEach((l) => l.classList.toggle('cur', +l.dataset.line === s.line));
    items.forEach((li, i) => { li.hidden = i > n; li.classList.toggle('now', i === n); });
    log.scrollTop = log.scrollHeight;
    status.textContent = s.status;
    count.textContent = `${n + 1} / ${steps.length}`;
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

  playBtn.addEventListener('click', play);
  root.querySelector('[data-act="step"]').addEventListener('click', () => {
    stop();
    show(Math.min(at + 1, steps.length - 1));
    stop();
  });
  root.querySelector('[data-act="reset"]').addEventListener('click', () => { stop(); show(0); stop(); });

  const asked = Number(new URLSearchParams(window.location.search).get('ha'));
  show(Number.isInteger(asked) && asked > 0 && asked <= steps.length ? asked - 1 : 0);
  stop();
  if (reduce || asked || !('IntersectionObserver' in window)) return;
  const seen = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      seen.disconnect();
      if (!timer && at === 0) play();
    }
  }, { threshold: 0.5 });
  seen.observe(root);
})();
