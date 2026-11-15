// Diagrams whose parts explain themselves: in a [data-explore] figure, clicking (or Enter/Space on)
// a [data-node] part shows the matching [data-info] block and hides the rest. "Next part" walks the
// parts in document order. All the text stays in the page, so LedbetterLM's page context has it.
(() => {
  document.querySelectorAll('[data-explore]').forEach((fig) => {
    const nodes = [...fig.querySelectorAll('[data-node]')];
    const infos = [...fig.querySelectorAll('[data-info]')];
    const order = infos.map((i) => i.dataset.info);
    if (!nodes.length || !infos.length) return;
    let cur = (infos.find((i) => !i.hidden) || infos[0]).dataset.info;
    const pick = (key) => {
      cur = key;
      nodes.forEach((n) => {
        const on = n.dataset.node === key;
        n.classList.toggle('on', on);
        n.setAttribute('aria-pressed', String(on));
      });
      infos.forEach((i) => { i.hidden = i.dataset.info !== key; });
    };
    nodes.forEach((n) => {
      n.addEventListener('click', () => pick(n.dataset.node));
      n.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(n.dataset.node); }
      });
    });
    const next = fig.querySelector('[data-explore-next]');
    if (next) next.addEventListener('click', () => pick(order[(order.indexOf(cur) + 1) % order.length]));
    pick(cur);
  });
})();
