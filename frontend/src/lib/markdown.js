// Minimal, XSS-safe Markdown-subset renderer for chat replies. Every piece of model
// text is HTML-escaped FIRST, then only our own controlled tags are injected — so nothing
// the model emits (or a prompt-injected reply) can render as live HTML. Covers the subset
// the bot actually produces: **bold**, *italic*, `code`, "- " bullet lists, "#" headings,
// and [text](http(s)://…) links. No raw HTML, no images, no scripts.

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inline formatting applied to already-line-split, not-yet-escaped text.
function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Only http(s) links — never javascript:/data: etc. (href is escaped via &quot; above).
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

export function mdToHtml(src) {
  const lines = String(src == null ? '' : src).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  // Fenced code blocks (``` … ```): render verbatim in a <pre><code>, no inline formatting.
  let inCode = false;
  let code = [];
  const flushCode = () => {
    out.push(`<pre class="mdCode"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    code = [];
  };
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(raw);
      continue;
    }
    const line = raw.replace(/\s+$/, '');
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
    } else if (heading) {
      closeList();
      out.push(`<div class="mdH">${inline(heading[2])}</div>`);
    } else if (line.trim() === '') {
      closeList();
      out.push('<span class="mdBr"></span>');
    } else {
      closeList();
      out.push(`<div>${inline(line)}</div>`);
    }
  }
  if (inCode) flushCode(); // unterminated fence → still render what we have
  closeList();
  return out.join('');
}
