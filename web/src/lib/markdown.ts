import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';

// Register only common languages — the full highlight.js bundle is ~1MB, the
// curated set keeps it small while covering what shows up in coding sessions.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import sql from 'highlight.js/lib/languages/sql';
import diff from 'highlight.js/lib/languages/diff';
import ini from 'highlight.js/lib/languages/ini';

for (const [name, lang] of Object.entries({
  javascript, typescript, python, bash, shell, json, xml, css, markdown,
  yaml, go, rust, java, c, cpp, sql, diff, ini,
})) {
  hljs.registerLanguage(name, lang as never);
}
// Common aliases
hljs.registerLanguage('js', javascript as never);
hljs.registerLanguage('ts', typescript as never);
hljs.registerLanguage('py', python as never);
hljs.registerLanguage('sh', bash as never);
hljs.registerLanguage('html', xml as never);
hljs.registerLanguage('vue', xml as never);
hljs.registerLanguage('yml', yaml as never);
hljs.registerLanguage('toml', ini as never);

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return escapeHtml(code);
      }
    },
  })
);
marked.setOptions({ gfm: true, breaks: true });

// Copy-button affordance: wrap every <pre> so a floating "copy" button can be
// layered on top. The actual copy reads the <code> textContent at click time
// (see MessageList's delegated handler), so no raw code is duplicated into DOM.
const COPY_BTN =
  '<button class="code-copy" type="button" title="复制代码" aria-label="复制代码">' +
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';

export function renderMarkdown(text: string): string {
  try {
    const html = marked.parse(text || '', { async: false }) as string;
    return html
      .replace(/<pre>/g, `<div class="code-block">${COPY_BTN}<pre>`)
      .replace(/<\/pre>/g, '</pre></div>');
  } catch {
    return escapeHtml(text);
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
