"""Build the heal replays on the Self-Healing Automation portfolio page.

The sample test (CheckoutTests.swift) was written for the page; it is not Apple code. Its trees
are the real parses the public Swift compiler prints, saved here so the build needs no Swift:

    swiftc -dump-parse CheckoutTests.swift > CheckoutTests.dump.txt 2>/dev/null
    swiftc -dump-parse CheckoutTests.healed.swift > CheckoutTests.healed.dump.txt 2>/dev/null
    swiftc -dump-parse CheckoutTests.alert-healed.swift > CheckoutTests.alert-healed.dump.txt 2>/dev/null

The runs are simulated: 50 passing runs on earlier builds give the plan prior. Three replays:
a new build renames the Checkout button ("Continue to Checkout"); a new OS build puts a system
alert in front of the app (the heal inserts a guard); and a run whose runner reports a failure
from teardown while every step matches the prior (no edit). Every number is computed below from
those runs and the parse trees. The output replaces the block between the heal-example markers
in public/portfolio/self-healing-agent.html. Run: python3 build.py, then python3 record.py to
re-record the replay GIFs.
"""
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, '..', '..', 'public', 'portfolio', 'self-healing-agent.html')
START, END = '<!-- heal-example:start -->', '<!-- heal-example:end -->'


# --- the parse tree --------------------------------------------------------------------------

def parse_dump(text):
    """Reads swiftc's parenthesized dump into {kind, attrs, kids} nodes (quotes may hold parens)."""
    root = {'kind': 'root', 'attrs': '', 'kids': []}
    stack, i, n = [root], 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == '\\' else 1
            stack[-1]['attrs'] += text[i:j + 1]
            i = j + 1
        elif c == '(':
            j = i + 1
            while j < n and not text[j].isspace() and text[j] not in '()':
                j += 1
            node = {'kind': text[i + 1:j], 'attrs': '', 'kids': []}
            stack[-1]['kids'].append(node)
            stack.append(node)
            i = j
        elif c == ')':
            stack.pop()
            i += 1
        else:
            stack[-1]['attrs'] += c
            i += 1
    return root


def attr(node, key):
    m = re.search(key + r'="([^"]*)"', node['attrs'])
    return m.group(1) if m else None


def find(node, kind):
    if node['kind'] == kind:
        return node
    for k in node['kids']:
        hit = find(k, kind)
        if hit:
            return hit
    return None


def literals(node):
    out = []
    if node['kind'] == 'string_literal_expr':
        out.append(attr(node, 'value'))
    for k in node['kids']:
        out += literals(k)
    return out


def flatten(node):
    out = [node]
    for k in node['kids']:
        out += flatten(k)
    return out


def tree_diff(a, b):
    """The (kind, before, after) of every node whose attributes differ, ignoring addresses."""
    clean = lambda s: re.sub(r'decl_context=0x[0-9a-f]+|range=\[[^\]]*\]|"[^"]*\.swift"', '', s)
    fa, fb = flatten(a), flatten(b)
    assert [x['kind'] for x in fa] == [x['kind'] for x in fb], 'tree shapes differ'
    return [(x['kind'], attr(x, 'value'), attr(y, 'value')) for x, y in zip(fa, fb)
            if clean(x['attrs']) != clean(y['attrs'])]


src = open(os.path.join(HERE, 'CheckoutTests.swift')).read().split('\n')
healed_src = open(os.path.join(HERE, 'CheckoutTests.healed.swift')).read().split('\n')
tree = parse_dump(open(os.path.join(HERE, 'CheckoutTests.dump.txt')).read())
healed_tree = parse_dump(open(os.path.join(HERE, 'CheckoutTests.healed.dump.txt')).read())
changed = tree_diff(tree, healed_tree)
assert len(changed) == 1 and changed[0][0] == 'string_literal_expr', changed

func = find(tree, 'func_decl')
body = func['kids'][[k['kind'] for k in func['kids']].index('brace_stmt')]


def line_of(node, after):
    """The node's source line: from its range when the dump has one, else by its literals."""
    m = re.search(r'range=\[[^:]+:(\d+):', node['attrs'])
    if m:
        return int(m.group(1))
    keys = literals(node) or [f for f in re.findall(r'field="([^"]*)"', ' '.join(x['attrs'] for x in flatten(node)))]
    for ln in range(after + 1, len(src) + 1):
        if all(k in src[ln - 1] for k in keys):
            return ln
    raise ValueError(node['kind'])


def short(text, n=40):
    text = text.strip()
    return text if len(text) <= n else text[:n - 1] + '…'


# Rows of the drawn tree: (depth, kind, detail, line). The failing step is expanded to its leaf.
rows = [(0, 'func_decl', re.search(r'"([^"]*)"', func['attrs']).group(1), None), (1, 'brace_stmt', '', None)]
last, fail_line = 4, None
for st in [k for k in body['kids'] if k['kind'] != 'var_decl']:
    ln = line_of(st, last)
    rows.append((2, st['kind'], short(src[ln - 1]), ln))
    last = ln
    if st['kind'] == 'if_stmt':
        inner = st['kids'][[k['kind'] for k in st['kids']].index('brace_stmt')]
        call = inner['kids'][0]
        cl = line_of(call, ln)
        rows.append((3, 'brace_stmt', '', None))
        rows.append((4, call['kind'], short(src[cl - 1].replace('app.alerts["Promo"]', '…')), cl))
        last = cl
    if 'Checkout' in literals(st):
        fail_line = ln
        tap = st['kids'][0]
        sub = tap['kids'][0]
        coll = sub['kids'][0]
        lit = find(sub['kids'][1], 'string_literal_expr')
        rows += [(3, tap['kind'], 'field="%s"' % attr(tap, 'field'), None),
                 (4, sub['kind'], '', None),
                 (5, coll['kind'], 'field="%s"' % attr(coll, 'field'), None),
                 (5, 'argument_list', '', None),
                 (6, lit['kind'], 'value="%s"' % attr(lit, 'value'), 'leaf')]


# --- the plan prior, the run and the heal -----------------------------------------------------

RUNS, PROMO = 50, 9  # simulated passing runs on earlier builds; the promo alert showed in 9
p_promo = PROMO / RUNS
history_screens = {6: 'Home', 7: 'Cart', 8: 'Cart', 10: 'Cart', 12: 'Checkout', 13: 'Checkout'}
prior = {5: ('', 1.0), 6: ('Home', 1.0), 7: ('Cart', 1.0), 8: ('Cart', 1.0),
         9: ('alert %d/%d' % (PROMO, RUNS), p_promo), 10: ('Cart', p_promo),
         12: ('Checkout', 1.0), 13: ('Checkout', 1.0)}
stayed_on_cart = 0  # of the 50 runs, how many stayed on Cart after line 12's tap

# The new build renames the button. What the run's test logs carried back, step by step:
on_screen = {'buttons': ['Edit', 'Continue to Checkout'], 'staticTexts': ['Your Cart', '2 items']}
run = {5: ('ok', ''), 6: ('ok', 'Home'), 7: ('ok', 'Cart'), 8: ('ok', 'Cart'),
       9: ('branch', 'no alert (%.2f)' % (1 - p_promo)), 10: ('skip', 'skipped'),
       12: ('dev', 'no match'), 13: ('none', 'not reached')}
healed = {5: ('ok', ''), 6: ('ok', 'Home'), 7: ('ok', 'Cart'), 8: ('ok', 'Cart'),
          9: ('branch', 'no alert'), 10: ('skip', 'skipped'), 12: ('ok', 'Checkout'), 13: ('ok', 'Checkout')}
path_lines = [5, 6, 7, 8, 9, 12, 13]  # the no-alert path both runs take
matches = sum(1 for ln in path_lines if healed[ln][0] in ('ok', 'branch')
              and (ln not in history_screens or healed[ln][1] == history_screens[ln]))
path_prior = 1 - p_promo


def words(s):
    return set(re.findall(r'[a-z0-9]+', s.lower()))


# The reasoning packet: every element predicate on the charted path, checked against the screen.
packet = []
for ln, coll, label in [(7, 'buttons', 'Cart'), (8, 'staticTexts', 'Your Cart'), (9, 'alerts', 'Promo'),
                        (12, 'buttons', 'Checkout'), (13, 'buttons', 'Pay')]:
    if run[ln][0] == 'ok':
        packet.append((coll, label, ln, 'yes', 'matched', ''))
    elif run[ln][0] == 'branch':
        packet.append((coll, label, ln, 'no', 'absent, as in %d of %d runs' % (RUNS - PROMO, RUNS), ''))
    elif run[ln][0] == 'none':
        packet.append((coll, label, ln, '–', 'not reached', ''))
    else:
        best = max(on_screen[coll], key=lambda c: len(words(label) & words(c)) / len(words(label)))
        share = len(words(label) & words(best)) / len(words(label))
        packet.append((coll, label, ln, 'no', 'adjust: %d%% of its words are in the on-screen &ldquo;%s&rdquo;'
                       % (round(share * 100), html.escape(best)), 'hi'))
adjust = [p for p in packet if p[5] == 'hi']
assert len(adjust) == 1 and adjust[0][2] == fail_line == 12


# --- the figure ---------------------------------------------------------------------------------

RH, TOP, CH = 26, 58, 6.0  # row height, first row's top, mono character width at 10px
X_LINE, X_PRIOR, X_RUN, X_HEAL = 452, 500, 682, 852
W = 1000
H = TOP + RH * len(rows) + 14
e = html.escape
CLS = {'ok': 'var(--green)', 'branch': 'var(--muted)', 'skip': 'var(--dim)', 'dev': 'var(--yellow)',
       'none': 'var(--dim)'}
MARK = {'ok': '✓ ', 'dev': '✗ ', 'branch': '', 'skip': '', 'none': ''}

svg = []
svg.append(f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Worked heal example. The real parse tree of a sample '
           f'test, from the public Swift compiler, with the plan prior calculated from {RUNS} simulated passing runs, a run '
           f'on a new build that renames the Checkout button and so deviates at line {fail_line}, and the healed run. The '
           f'heal changes one node of the tree, the string literal Checkout, to Continue to Checkout, and the healed run '
           f'matches the prior at all {matches} statements on its path.">')
heads = [(16, 'Syntax tree (swiftc -dump-parse, pruned)'), (X_LINE, 'Line'), (X_PRIOR, f'Plan prior ({RUNS} runs)'),
         (X_RUN, 'Run on the new build'), (X_HEAL, 'After the heal')]
subs = [(X_PRIOR, 'screen after \u00b7 P(reach)'), (X_RUN, 'from its test logs'), (X_HEAL, 're-parsed, run again')]
for x, t in heads:
    svg.append(f'<text class="d-title" x="{x}" y="22">{e(t)}</text>')
for x, t in subs:
    svg.append(f'<text class="d-sub" x="{x}" y="38">{e(t)}</text>')
svg.append(f'<path class="d-line" style="--c: var(--line)" d="M16,48 H{W - 16}"/>')

ys = [TOP + RH * i + RH / 2 for i in range(len(rows))]
for i, (d, kind, detail, ln) in enumerate(rows):
    y = ys[i]
    if ln == fail_line or ln == 'leaf':
        svg.append(f'<rect x="10" y="{y - RH / 2 + 2:g}" width="{W - 20}" height="{RH - 4}" '
                   f'style="fill: none; stroke: var(--yellow); stroke-width: 1; stroke-dasharray: 3 3"/>')
    if d:
        parent = max(j for j in range(i) if rows[j][0] == d - 1)
        px = 16 + (d - 1) * 16 + 4
        svg.append(f'<path class="d-line" style="--c: var(--dim); stroke-width: 1" '
                   f'd="M{px},{ys[parent] + 6:g} V{y:g} H{16 + d * 16 - 3}"/>')
    x = 16 + d * 16
    svg.append(f'<text class="d-note" x="{x}" y="{y + 3.5:g}">{e(kind)}</text>')
    if detail:
        fill = 'var(--yellow)' if ln == 'leaf' else 'var(--ink)'
        svg.append(f'<text class="d-note" x="{x + len(kind) * CH + 8:g}" y="{y + 3.5:g}" style="fill: {fill}">{e(detail)}</text>')
    if isinstance(ln, int):
        svg.append(f'<text class="d-note" x="{X_LINE}" y="{y + 3.5:g}">{ln}</text>')
        screen, p = prior[ln]
        label = (screen + ' · ' if screen else '') + '%.2f' % p
        svg.append(f'<text class="d-note" x="{X_PRIOR}" y="{y + 3.5:g}" style="fill: var(--blue)">{e(label)}</text>')
        for col, data in ((X_RUN, run), (X_HEAL, healed)):
            kind_, txt = data[ln]
            svg.append(f'<text class="d-note" x="{col}" y="{y + 3.5:g}" style="fill: {CLS[kind_]}">'
                       f'{e(MARK[kind_] + txt)}</text>')
    if ln == 'leaf':
        svg.append(f'<text class="d-note" x="{X_HEAL}" y="{y + 3.5:g}" style="fill: var(--green)">'
                   f'{e(chr(34) + changed[0][2] + chr(34))}</text>')
        svg.append(f'<text class="d-note" x="{X_RUN}" y="{y + 3.5:g}" style="fill: var(--yellow)">predicate to adjust</text>')
svg.append('</svg>')

HI = ' class="hi" style="--c: var(--yellow)"'
packet_rows = '\n'.join(
    f'        <tr><td>{e(coll)}[&ldquo;{e(label)}&rdquo;]</td><td>{ln}</td><td>{on}</td>'
    f'<td{HI if hi else ""}>{verdict}</td></tr>'
    for coll, label, ln, on, verdict, hi in packet)

code = []
for i, line in enumerate(src, 1):
    if not line.strip() and i == len(src):
        continue
    if i == fail_line:
        code.append(f'<span class="ln">{i:>2}</span> <span class="del">{e(line)}</span>')
        code.append(f'<span class="ln">{i:>2}</span> <span class="add">{e(healed_src[i - 1])}</span>')
    else:
        code.append(f'<span class="ln">{i:>2}</span> {e(line)}')
code = '\n'.join(code)


# --- the second heal: a system alert on a new OS build ------------------------------------------

def stmts(t):
    """The test function's top-level statements, without the var_decl swiftc prints beside each let."""
    f = find(t, 'func_decl')
    b = f['kids'][[k['kind'] for k in f['kids']].index('brace_stmt')]
    return [k for k in b['kids'] if k['kind'] != 'var_decl']


def sig(node):
    clean = lambda s: re.sub(r'decl_context=0x[0-9a-f]+|range=\[[^\]]*\]|"[^"]*\.swift"', '', s)
    return [(x['kind'], clean(x['attrs'])) for x in flatten(node)]


alert_src = open(os.path.join(HERE, 'CheckoutTests.alert-healed.swift')).read().split('\n')
alert_tree = parse_dump(open(os.path.join(HERE, 'CheckoutTests.alert-healed.dump.txt')).read())
orig_st, alert_st = stmts(tree), stmts(alert_tree)
n_added = len(alert_st) - len(orig_st)
at = next(i for i, (a, b) in enumerate(zip(orig_st, alert_st)) if sig(a) != sig(b))
assert all(sig(a) == sig(b) for a, b in zip(orig_st, alert_st[:at] + alert_st[at + n_added:])), 'an original statement changed'
added_kinds = [s['kind'] for s in alert_st[at:at + n_added]]
inserted = alert_src[6:6 + 4]  # the guard, after line 6 (app.launch())
assert alert_src[:6] == src[:6] and alert_src[10:] == src[6:], 'the guard is not a pure insertion after line 6'
SYS_ALERTS = 0  # of the 50 runs, how many showed a system alert at launch


# --- the replays: a fake app on the left, the agent on the right ---------------------------------

def btn(x, y, w, h, label, filled=False):
    fill = 'var(--green)' if filled else 'none'
    stroke = 'var(--green)' if filled else 'var(--dim)'
    color = '#000' if filled else 'var(--ink)'
    weight = ' font-weight: 600;' if filled else ''
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" style="fill: {fill}; stroke: {stroke}"/>'
            f'<text x="{x + w / 2:g}" y="{y + h / 2 + 4:g}" text-anchor="middle" style="fill: {color}; font-size: 11px;{weight}">{e(label)}</text>')


def item(y, name, price):
    return (f'<rect x="26" y="{y}" width="188" height="48" rx="6" style="fill: #0b0b0b; stroke: var(--line)"/>'
            f'<rect x="36" y="{y + 10}" width="28" height="28" rx="4" style="fill: var(--line)"/>'
            f'<text x="74" y="{y + 28}" style="fill: var(--ink); font-size: 11px">{e(name)}</text>'
            f'<text x="204" y="{y + 28}" text-anchor="end" style="fill: var(--muted); font-size: 11px">{e(price)}</text>')


def head(t):
    return f'<text x="26" y="72" style="fill: var(--ink); font-size: 18px; font-weight: 700">{e(t)}</text>'


def ctext(y, t, size=11, fill='var(--ink)', bold=False):
    w = ' font-weight: 700;' if bold else ''
    return f'<text x="120" y="{y}" text-anchor="middle" style="fill: {fill}; font-size: {size}px;{w}">{e(t)}</text>'


BACKDROP = '<rect x="3" y="3" width="234" height="474" rx="30" style="fill: rgba(0, 0, 0, .62)"/>'


def dialog(y, h, lines, left, right):
    """An alert box: centered lines, then two buttons split by hairlines."""
    sep = y + h - 50
    return (BACKDROP + f'<rect x="30" y="{y}" width="180" height="{h}" rx="12" style="fill: #161616; stroke: var(--dim)"/>'
            + ''.join(ctext(*ln) for ln in lines)
            + f'<path d="M30,{sep} H210 M120,{sep} V{y + h}" style="stroke: var(--dim); fill: none"/>'
            f'<text x="75" y="{sep + 29}" text-anchor="middle" style="fill: var(--link); font-size: 11px">{e(left)}</text>'
            f'<text x="165" y="{sep + 29}" text-anchor="middle" style="fill: var(--link); font-size: 11px; font-weight: 600">{e(right)}</text>')


def phone_svg(cart_label, build_label, aria):
    return (
        f'<svg viewBox="0 0 240 480" role="img" aria-label="{e(aria)}">'
        '<rect x="3" y="3" width="234" height="474" rx="30" style="fill: #000; stroke: var(--dim); stroke-width: 2"/>'
        '<rect x="92" y="12" width="56" height="16" rx="8" style="fill: var(--line)"/>'
        '<text x="26" y="25" class="d-note">9:41</text>'
        f'<text x="214" y="25" text-anchor="end" class="d-note">{e(build_label)}</text>'
        '<g data-screen="home">' + head('Shop')
        + btn(164, 52, 52, 26, 'Cart') + item(100, 'Headphones', '$199') + item(158, 'Phone case', '$29')
        + '<text x="26" y="236" class="d-sub">Free shipping over $50</text></g>'
        '<g data-screen="cart">' + head('Your Cart') + '<text x="26" y="92" class="d-sub">2 items</text>'
        + item(104, 'Headphones', '$199') + item(162, 'Phone case', '$29')
        + '<text x="26" y="244" style="fill: var(--muted); font-size: 11px">Total</text>'
          '<text x="214" y="244" text-anchor="end" style="fill: var(--ink); font-size: 11px">$228</text>'
        + btn(26, 348, 188, 36, 'Edit') + btn(26, 394, 188, 42, cart_label, filled=True) + '</g>'
        '<g data-screen="checkout">' + head('Checkout')
        + ''.join(f'<text x="26" y="{y}" style="fill: var(--muted); font-size: 11px">{a}</text>'
                  f'<text x="214" y="{y}" text-anchor="end" style="fill: var(--ink); font-size: 11px">{b}</text>'
                  for y, a, b in ((112, 'Ship to', 'Home'), (140, 'Payment', 'Card'), (168, 'Total', '$228')))
        + btn(26, 394, 188, 42, 'Pay $228', filled=True) + '</g>'
        '<g class="ha-promo">' + dialog(168, 124, [(196, 'Promo', 13, 'var(--ink)', True),
                                                  (216, '10% off your order today', 10.5, 'var(--muted)')],
                                        'Not Now', 'Use Code') + '</g>'
        '<g class="ha-sys">' + dialog(150, 146, [(176, '“Shop” Would Like to', 11.5, 'var(--ink)', True),
                                                (192, 'Send You Notifications', 11.5, 'var(--ink)', True),
                                                (212, 'Notifications may include alerts,', 9.5, 'var(--muted)'),
                                                (225, 'sounds and icon badges.', 9.5, 'var(--muted)')],
                                      'Don’t Allow', 'Allow') + '</g>'
        '<g class="ha-toast"><rect x="22" y="282" width="196" height="46" rx="6" style="fill: #000; stroke: var(--yellow)"/>'
        '<text class="ha-t1" x="120" y="301" text-anchor="middle" style="fill: var(--yellow); font-size: 10.5px"></text>'
        '<text class="ha-t2" x="120" y="317" text-anchor="middle" style="fill: var(--yellow); font-size: 10.5px"></text></g>'
        '<text class="ha-hud" x="120" y="461" text-anchor="middle"></text>'
        '<rect class="ha-hlbox" x="0" y="0" width="0" height="0" rx="9"/>'
        '<circle class="ha-tapring" cx="0" cy="0" r="16"/>'
        '</svg>')


BODY = ' ' * 8  # the method body's indent


def code_line(text):
    """A body line's shared indent goes in its own span, so the narrow layout can drop it."""
    return f'<span class="ib">{BODY}</span>{e(text[len(BODY):])}' if text.startswith(BODY) else e(text)


def code_pane(lines, swap=None, insert_after=None, inserts=()):
    """The test's source with a status gutter; a swapped line shows old then new, inserted lines show once healed.
    Lines outside the method body get class "out", which the narrow layout hides beside the phone."""
    out = []
    for i, line in enumerate(lines, 1):
        if not line.strip() and i == len(lines):
            continue
        if swap and i == swap[0]:
            assert line.startswith(BODY) and swap[1].startswith(BODY)
            body_ = f'<span class="ib">{BODY}</span><span class="old">{e(line[len(BODY):])}</span><span class="new">{e(swap[1][len(BODY):])}</span>'
        else:
            body_ = code_line(line)
        cls = '' if line.startswith(BODY) else ' class="out"'
        out.append(f'<span data-line="{i}"{cls}><span class="ln">{i:>2}</span><span class="mk"></span>{body_}</span>')
        if i == insert_after:
            out += [f'<span data-line="g" class="ins"><span class="ln"> +</span><span class="mk"></span>{code_line(x)}</span>'
                    for x in inserts]
    return ''.join(out)


CART, NOTNOW, DONT, CONT = [190, 65], [75, 267], [75, 271], [120, 415]
YOURCART, PRIMARY, DONT_BOX = [20, 50, 116, 30], [22, 390, 196, 50], [32, 248, 86, 46]
NEW_LABEL = changed[0][2]
S = lambda **k: k
ok_path = lambda lines: [[ln, 'ok'] for ln in lines]

rename_steps = [
    S(screen='home', line=6, status='run 51 · new build', ms=1900, kind='info', clear=True, hud='run 51 · new build',
      log='Run 51 on the new build. Its test logs stream back over the serial protocol.'),
    S(screen='home', line=6, status='run 51 · new build', ms=1500, kind='ok', marks=ok_path([5, 6]), hud='L6 ✓ Home',
      log='L6 app.launch(): Home. Prior: Home, 1.00. ✓'),
    S(screen='home', line=7, tap=CART, status='run 51 · new build', ms=1300, kind='ok', marks=ok_path([7]), hud='L7 ✓ tap Cart',
      log='L7 tap buttons["Cart"]. ✓'),
    S(screen='cart', line=8, hl=YOURCART, status='run 51 · new build', ms=1600, kind='ok', marks=ok_path([8]), hud='L8 ✓ Your Cart',
      log='L8 wait for staticTexts["Your Cart"]: Cart. Prior: Cart, 1.00. ✓'),
    S(screen='cart', line=9, status='run 51 · new build', ms=1600, kind='ok', marks=ok_path([9]), hud=f'L9 ✓ no promo ({1 - p_promo:.2f})',
      log=f'L9 alerts["Promo"] absent: the {1 - p_promo:.2f} branch. ✓'),
    S(screen='cart', line=12, toast=['No button matches', '“Checkout”'], status='run 51 · deviation', ms=2800, kind='dev',
      marks=[[12, 'dev']], hud='L12 ✗ no match',
      log=f'L12 tap buttons["Checkout"]: no match. Still on Cart, which {"none" if stayed_on_cart == 0 else stayed_on_cart} of {RUNS} runs did. ✗ Deviation from the prior.'),
    S(screen='cart', line=12, hl=PRIMARY, hlc='yellow', status='worker · reasoning packet', ms=3400, kind='info', hud='worker: reasoning packet',
      log=f'Worker: the screenshot shows the buttons "Edit" and "{NEW_LABEL}". Packet: adjust buttons["Checkout"]; '
          f'100% of its words are in "{NEW_LABEL}".'),
    S(screen='cart', line=12, code='new', status='agent · editing', ms=2200, kind='heal', hud='editing line 12',
      log=f'Agent edits line 12: buttons["{NEW_LABEL}"].'),
    S(screen='cart', line=12, code='new', status='agent · recompiling', ms=2000, kind='heal', hud='recompiled ✓',
      log=f'Recompile and re-parse: 1 node changed ({changed[0][0]}). ✓'),
    S(screen='home', line=6, code='new', clear=True, status='run 52 · new build', ms=1500, kind='info', hud='run 52 · healed test',
      log='Run 52 on the new build, with the healed test.'),
    S(screen='home', line=7, code='new', tap=CART, status='run 52 · new build', ms=1300, kind='ok', marks=ok_path([5, 6, 7, 8, 9]),
      hud='L6–L9 ✓', log='L6-L9 match the prior. ✓'),
    S(screen='cart', line=12, code='new', tap=CONT, status='run 52 · new build', ms=1500, kind='ok', marks=ok_path([12]), hud='L12 ✓ Checkout',
      log=f'L12 tap buttons["{NEW_LABEL}"]: Checkout. Prior: Checkout, 1.00. ✓'),
    S(screen='checkout', line=13, code='new', hl=PRIMARY, status='healed', ms=3000, kind='heal', marks=ok_path([13]), hud='✓ healed',
      log=f'L13 buttons["Pay"].isEnabled. ✓ {matches} of {matches} statements match the prior. Healed.'),
]

n_orig = len(orig_st)
sys_steps = [
    S(screen='home', line=6, overlay='sys', status='run 51 · new OS build', ms=2000, kind='info', clear=True, hud='run 51 · new OS build',
      log='Run 51 on a new OS build. Its test logs stream back over the serial protocol.'),
    S(screen='home', line=6, overlay='sys', status='run 51 · new OS build', ms=2400, kind='info', marks=ok_path([5, 6]), hud='L6 Home, under an alert',
      log=f'L6 app.launch(): Home, under a system alert. Prior: Home, 1.00; a system alert in {SYS_ALERTS} of {RUNS} runs.'),
    S(screen='home', line=7, overlay='sys', tap=CART, status='run 51 · deviation', ms=2800, kind='dev', marks=[[7, 'dev']],
      hud='L7 ✗ alert in front',
      log=f'L7 tap buttons["Cart"]: not hittable, the alert is in front. Still on Home, which none of {RUNS} runs did. ✗ Deviation from the prior.'),
    S(screen='home', line=7, overlay='sys', hl=DONT_BOX, hlc='yellow', status='worker · reasoning packet', ms=3600, kind='info',
      hud='worker: reasoning packet',
      log='Worker: the screenshot shows a system alert with "Don\'t Allow" and "Allow". No predicate on the path covers it, '
          'so the packet asks for a new one before line 7: dismiss the alert.'),
    S(screen='home', line='g', overlay='sys', code='new', status='agent · editing', ms=2400, kind='heal', hud='inserting a guard',
      log='Agent inserts a guard after line 6: if the system alert shows, tap "Don\'t Allow".'),
    S(screen='home', line='g', overlay='sys', code='new', status='agent · recompiling', ms=2400, kind='heal', hud='recompiled ✓',
      log=f'Recompile and re-parse: {n_added} statements added after line 6 ({", ".join(added_kinds)}); '
          f'the {n_orig} original statements unchanged. ✓'),
    S(screen='home', line=6, overlay='sys', code='new', clear=True, status='run 52 · new OS build', ms=1600, kind='info',
      hud='run 52 · healed test', log='Run 52 on the new OS build, with the healed test.'),
    S(screen='home', line='g', overlay='sys', code='new', tap=DONT, status='run 52 · new OS build', ms=1700, kind='ok',
      marks=ok_path([5, 6, 'g']), hud='guard ✓ Don’t Allow', log='Guard: the alert is there; tap "Don\'t Allow". ✓'),
    S(screen='home', line=7, code='new', tap=CART, status='run 52 · new OS build', ms=1400, kind='ok', marks=ok_path([7]),
      hud='L7 ✓ tap Cart', log='L7 tap buttons["Cart"]. ✓'),
    S(screen='cart', line=12, code='new', tap=CONT, status='run 52 · new OS build', ms=1600, kind='ok', marks=ok_path([8, 9, 12]),
      hud='L8–L12 ✓', log='L8-L12 match the prior. ✓'),
    S(screen='checkout', line=13, code='new', hl=PRIMARY, status='healed', ms=3000, kind='heal', marks=ok_path([13]), hud='✓ healed',
      log=f'L13 buttons["Pay"].isEnabled. ✓ All {n_orig} original statements match the prior. Healed.'),
]

promo_path = [5, 6, 7, 8, 9, 10, 12, 13]  # the promo branch: one more statement than the no-alert path
false_steps = [
    S(screen='home', line=6, status='run 51 · new build', ms=1900, kind='info', clear=True, hud='run 51 · new build',
      log='Run 51 on a new build. Its test logs stream back over the serial protocol.'),
    S(screen='home', line=7, tap=CART, status='run 51 · new build', ms=1500, kind='ok', marks=ok_path([5, 6, 7]), hud='L6–L7 ✓',
      log='L6-L7: Home, then tap buttons["Cart"]. ✓'),
    S(screen='cart', line=9, overlay='promo', status='run 51 · new build', ms=2600, kind='ok', marks=ok_path([8, 9]),
      hud=f'L9 ✓ promo ({p_promo:.2f})',
      log=f'L8 Cart. ✓ L9 alerts["Promo"] shown: the {p_promo:.2f} branch, seen in {PROMO} of {RUNS} runs. ✓ Not a deviation.'),
    S(screen='cart', line=10, overlay='promo', tap=NOTNOW, status='run 51 · new build', ms=1500, kind='ok', marks=ok_path([10]),
      hud='L10 ✓ Not Now', log='L10 tap "Not Now". ✓'),
    S(screen='cart', line=12, tap=CONT, status='run 51 · new build', ms=1500, kind='ok', marks=ok_path([12]), hud='L12 ✓ Checkout',
      log='L12 tap buttons["Checkout"]: Checkout. ✓'),
    S(screen='checkout', line=13, hl=PRIMARY, status='run 51 · new build', ms=1600, kind='ok', marks=ok_path([13]), hud='L13 ✓ Pay enabled',
      log='L13 buttons["Pay"].isEnabled. ✓'),
    S(screen='checkout', line=13, toast=['Runner: FAILED', 'device disconnected'], status='run 51 · reported failed', ms=2800,
      kind='warn', hud='runner: FAILED', log='The runner reports FAILED: the device disconnected during teardown.'),
    S(screen='checkout', line=13, status='worker · reasoning packet', ms=3800, kind='info', hud='worker: no deviation',
      log=f'Worker: all {len(promo_path)} statements on the charted path match the prior, the promo branch included. '
          'The failure came after the test, not from it. No predicate to adjust.'),
    S(screen='checkout', line=None, status='no edit', ms=2400, kind='ok', hud='no edit',
      log='No edit. Marked a false error report.'),
    S(screen='home', line=6, clear=True, status='run 52 · new build', ms=1600, kind='info', hud='run 52 · same test',
      log='Run 52 on the same build, test unchanged.'),
    S(screen='checkout', line=13, hl=PRIMARY, status='passed', ms=3000, kind='heal', marks=ok_path(promo_path), hud='✓ passed, no edit',
      log=f'All {len(promo_path)} statements match the prior. Passed, with no heal needed.'),
]

SCENARIOS = [
    dict(id='rename', title='Renamed button', blurb='A UI change renames Checkout. One string literal heals.',
         build='new build', cart=NEW_LABEL, steps=rename_steps,
         code=code_pane(src, swap=(fail_line, healed_src[fail_line - 1])),
         aria=f'A fake shop app on the new build: Home, Cart and Checkout. On Cart the button now reads {NEW_LABEL}.',
         gif_alt=f'Replay: the Checkout button is renamed {NEW_LABEL}, the run deviates at line 12, the agent edits the '
                 'string, and the rerun reaches Checkout.'),
    dict(id='sysalert', title='New system alert', blurb='An OS quirk puts an alert in front of the app. A guard is added.',
         build='new OS', cart='Checkout', steps=sys_steps,
         code=code_pane(src, insert_after=6, inserts=inserted),
         aria='A fake shop app on a new OS build: a system notification alert covers the Home screen at launch.',
         gif_alt='Replay: a system alert covers the app at launch, the run deviates at line 7, the agent inserts a guard '
                 'that dismisses it, and the rerun reaches Checkout.'),
    dict(id='falsealarm', title='False alarm', blurb='The runner reports a failure the screens contradict. No edit.',
         build='new build', cart='Checkout', steps=false_steps, code=code_pane(src),
         aria='A fake shop app on a new build: the run passes through the promo alert to Checkout.',
         gif_alt='Replay: every step matches the prior, the runner still reports a failure from teardown, and the agent '
                 'leaves the test unchanged; the rerun passes.'),
]

import json
for sc in SCENARIOS:
    for st in sc['steps']:
        st.setdefault('code', 'old')


def player(sc, first):
    steps = sc['steps']
    log_items = '\n'.join(f'          <li class="k-{st["kind"]}">{e(st["log"])}</li>' for st in steps)
    return f"""    <div id="heal-{sc['id']}" class="heal-anim"{'' if first else ' hidden'}>
      <div class="phone" data-screen="home">{phone_svg(sc['cart'], sc['build'], sc['aria'])}</div>
      <div class="agent">
        <div class="agent-head"><span class="dot"></span><b>{e(sc['title'])}</b><span class="ha-status">{e(steps[0]['status'])}</span></div>
        <pre class="code">{sc['code']}</pre>
        <ol class="ha-log" aria-label="The agent's log">
{log_items}
        </ol>
        <div class="ha-controls"><button class="btn" type="button" data-act="play">Play</button><button class="btn" type="button" data-act="back" aria-label="Previous step">&larr;</button><button class="btn" type="button" data-act="step" aria-label="Next step">&rarr;</button><input class="ha-scrub" type="range" min="1" max="{len(steps)}" value="1" aria-label="Step"><span class="ha-count"></span></div>
      </div>
      <script type="application/json">{json.dumps(steps, ensure_ascii=False)}</script>
    </div>"""


GIF_V = 2  # bump when record.py re-records, so browsers drop cached GIFs


def gif_size(rid):
    """Width and height from the recorded GIF's header (record.py writes it), for the img's aspect ratio."""
    try:
        with open(os.path.join(os.path.dirname(PAGE), 'replays', f'{rid}.gif'), 'rb') as f:
            head = f.read(10)
        return int.from_bytes(head[6:8], 'little'), int.from_bytes(head[8:10], 'little')
    except OSError:
        return 640, 600


cards = '\n'.join(
    f"""      <button class="replay-card" type="button" data-target="heal-{sc['id']}" aria-pressed="{'true' if i == 0 else 'false'}">
        <b>{e(sc['title'])}</b><span>{e(sc['blurb'])}</span>
        <picture><source media="(prefers-reduced-motion: reduce)" srcset="replays/{sc['id']}.png?v={GIF_V}"><img src="replays/{sc['id']}.gif?v={GIF_V}" alt="{e(sc['gif_alt'])}" width="{gif_size(sc['id'])[0]}" height="{gif_size(sc['id'])[1]}" loading="lazy"></picture>
      </button>""" for i, sc in enumerate(SCENARIOS))

block = f"""{START}
  <section id="watch">
    <h2>Watch it heal</h2>
    <p class="note">Three replays on a sample shop app. Pick one to step through it.</p>
    <div class="replay-cards">
{cards}
    </div>
{chr(10).join(player(sc, i == 0) for i, sc in enumerate(SCENARIOS))}
    <p class="fine">Sample test written for this page; runs simulated. Not Apple code or Apple data. The plan prior comes from {RUNS} simulated passing runs on earlier builds (the promo alert showed in {PROMO}).</p>
    <details class="deep">
      <summary>Under the hood of the renamed-button heal: the parse tree, the reasoning packet and the diff</summary>
      <p>The tree is the real parse of the sample test from the public Swift compiler, standing in for David&rsquo;s parser. Each row carries the plan prior: the screen the step should reach, and the chance the run gets there.</p>
      <div class="scroll">{''.join(svg)}</div>
      <div class="legend">
        <span style="--c: var(--blue)"><i></i>Plan prior</span>
        <span style="--c: var(--green)"><i></i>Matches the prior</span>
        <span style="--c: var(--yellow)"><i></i>Deviation and the predicate to adjust</span>
      </div>
      <div class="heal-grid">
        <div>
          <h3>The reasoning packet</h3>
          <p class="note">Each element predicate on the charted path, checked against the screen the run&rsquo;s logs carried back.</p>
          <div class="scroll"><table class="packet">
            <thead><tr><th>Predicate</th><th>Line</th><th>On screen</th><th>Verdict</th></tr></thead>
            <tbody>
{packet_rows}
            </tbody>
          </table></div>
        </div>
        <div>
          <h3>The heal</h3>
          <p class="note">One edit, then a re-parse: the tree changes in exactly one node, the <code>{changed[0][0]}</code> on line {fail_line}.</p>
          <pre class="code">{code}</pre>
        </div>
      </div>
      <p>Run again on the new build, the healed test matches the prior at all {matches} statements on its path, and the run is back on a path the prior gives {path_prior:.2f}. At line {fail_line} the unhealed run had stayed on the Cart screen, which {'none' if stayed_on_cart == 0 else stayed_on_cart} of the {RUNS} earlier runs did.</p>
    </details>
  </section>
{END}"""

page = open(PAGE).read()
assert page.count(START) == 1 and page.count(END) == 1, 'the page needs one pair of heal-example markers'
a, b = page.index(START), page.index(END) + len(END)
page = page[:a] + block + page[b:]
open(PAGE, 'w').write(page)
print('wrote %d replays: %s; renamed-button tree has %d rows, deviation at line %d, %d statements match after the heal; '
      'system alert adds %d statements (%s)' % (len(SCENARIOS), ', '.join('%s %d steps' % (s['id'], len(s['steps'])) for s in SCENARIOS),
                                               len(rows), fail_line, matches, n_added, ', '.join(added_kinds)))
