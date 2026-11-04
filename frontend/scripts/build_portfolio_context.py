#!/usr/bin/env python3
"""Extract each portfolio page's text into public/portfolio/context/<slug>.json.

LedbetterLM's backend reads these when a visitor asks from a portfolio page, so the chat
answers from the page's real text, loaded by the server. The browser only says which
page and section the visitor was on; it never supplies the text itself.

Section ids are the slugified h1/h2 text, the same rule portfolio/ask.js uses, so a
section the visitor was looking at can be found here. Runs as the frontend's prebuild.
"""
import html
import json
import os
import re
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO = os.path.join(HERE, '..', 'public', 'portfolio')
OUT = os.path.join(PORTFOLIO, 'context')
SKIP = {'script', 'style', 'svg', 'nav', 'footer'}
MAX_SECTION = 4000


def slugify(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:60]


class Page(HTMLParser):
    """Collects the hero and each top-level section or figure inside .wrap."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0          # element depth inside .wrap's direct children
        self.in_wrap = False
        self.wrap_depth = None
        self.skip = 0
        self.blocks = []        # [{'heading': str, 'text': [...], 'cls': str}]
        self.cur = None
        self.heading_tag = None
        self.heading = []
        self.title = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if self.wrap_depth is None:
            if tag == 'div' and 'wrap' in cls.split():
                self.wrap_depth = 0
            return
        if tag in ('br', 'img', 'meta', 'link', 'input', 'hr'):
            return
        self.wrap_depth += 1
        if self.wrap_depth == 1 and tag in ('header', 'section', 'figure'):
            self.cur = {'heading': '', 'text': [], 'cls': cls, 'tag': tag}
        if self.cur is None:
            return
        if tag in SKIP:
            self.skip += 1
        if tag in ('h1', 'h2') and not self.cur['heading'] and not self.skip:
            self.heading_tag = tag
            self.heading = []
        if tag in ('p', 'li', 'tr', 'h2', 'h3', 'div', 'figcaption', 'th', 'td'):
            self.cur['text'].append(' ')

    def handle_endtag(self, tag):
        if self.wrap_depth is None or tag in ('br', 'img', 'meta', 'link', 'input', 'hr'):
            return
        if self.cur is not None:
            if tag in SKIP and self.skip:
                self.skip -= 1
            if self.heading_tag == tag:
                self.cur['heading'] = ' '.join(''.join(self.heading).split())
                if tag == 'h1':
                    self.title = self.cur['heading']
                self.heading_tag = None
            if tag in ('p', 'li', 'tr', 'h2', 'h3', 'figcaption'):
                self.cur['text'].append('\n')
        if self.wrap_depth == 1 and self.cur is not None and tag == self.cur['tag']:
            self.blocks.append(self.cur)
            self.cur = None
        self.wrap_depth -= 1
        if self.wrap_depth < 0:
            self.wrap_depth = None

    def handle_data(self, data):
        if self.cur is None or self.skip:
            return
        if self.heading_tag:
            self.heading.append(data)
        self.cur['text'].append(data)


def clean(parts):
    text = html.unescape(''.join(parts))
    lines = [' '.join(line.split()) for line in text.split('\n')]
    return '\n'.join(line for line in lines if line)[:MAX_SECTION]


def build():
    os.makedirs(OUT, exist_ok=True)
    built = []
    for name in sorted(os.listdir(PORTFOLIO)):
        if not name.endswith('.html'):
            continue
        slug = name[:-5]
        p = Page()
        with open(os.path.join(PORTFOLIO, name), encoding='utf-8') as f:
            p.feed(f.read())
        sections = []
        for b in p.blocks:
            if 'cta' in b['cls'].split() or 'sources' in b['cls'].split():
                continue
            heading = b['heading'] or ('Overview' if b['tag'] == 'header' else '')
            if not heading:
                continue
            sid = 'overview' if b['tag'] == 'header' else slugify(heading)
            sections.append({'id': sid, 'heading': heading, 'text': clean(b['text'])})
        if not p.title or not sections:
            raise SystemExit(f'{name}: no title or sections found')
        with open(os.path.join(PORTFOLIO, name), encoding='utf-8') as f:
            raw = f.read()
        repos = []
        for url in re.findall(r'href="(https://github\.com/dledbetter123/[A-Za-z0-9._-]+)/?"', raw):
            if url not in repos:
                repos.append(url)
        doc = {'slug': slug, 'title': p.title, 'url': f'https://davidamosledbetter.com/portfolio/{name}',
               'repos': repos, 'sections': sections}
        with open(os.path.join(OUT, f'{slug}.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        built.append(f'{slug} ({len(sections)} sections)')
    print('portfolio context:', ', '.join(built))


if __name__ == '__main__':
    build()
