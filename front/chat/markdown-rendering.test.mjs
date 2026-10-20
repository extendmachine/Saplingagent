import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { escapeCurrencyDollars, normalizeMathDelimiters } from '@assistant-ui/react-markdown';

const read = relative => fs.readFile(new URL(relative, import.meta.url), 'utf8');

test('assistant messages enable GFM and local KaTeX math rendering', async () => {
  const [source, styles, packageJson] = await Promise.all([
    read('./ChatPanel.tsx'),
    read('./chat.css'),
    read('../package.json'),
  ]);
  const dependencies = JSON.parse(packageJson).dependencies;

  assert.match(source, /remarkPlugins=\{\[remarkGfm, remarkMath\]\}/);
  assert.match(source, /rehypePlugins=\{\[\[rehypeKatex, \{ trust: false \}\]\]\}/);
  assert.match(source, /preprocess=\{preprocessMarkdown\}/);
  assert.match(source, /escapeCurrencyDollars\(normalizeMathDelimiters\(text\)\)/);
  assert.match(source, /katex\/dist\/katex\.min\.css/);
  assert.equal(dependencies['remark-math'], '6.0.0');
  assert.equal(dependencies['rehype-katex'], '7.0.1');
  assert.equal(dependencies.katex, '0.19.0');
  assert.match(styles, /\.markdown-text \.katex-display/);
  assert.match(styles, /overflow: auto hidden/);
});

test('Markdown typography covers headings, nested lists, code and tables', async () => {
  const styles = await read('./chat.css');

  assert.match(styles, /\.markdown-text h1 \{/);
  assert.match(styles, /\.markdown-text h6/);
  assert.match(styles, /\.markdown-text li > ul/);
  assert.match(styles, /\.markdown-text pre code/);
  assert.match(styles, /\.markdown-text th \{/);
});

test('the configured pipeline emits GFM and accessible KaTeX markup without consuming currency', () => {
  const source = '# Heading\n\nInline \\(x^2 + y^2\\) costs $5.\n\n$$\n\\frac{a}{b}\n$$\n\n| A | B |\n|---|---|\n| 1 | 2 |';
  const text = escapeCurrencyDollars(normalizeMathDelimiters(source));
  const html = renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [rehypeKatex],
    children: text,
  }));

  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-mathml"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<table>/);
  assert.match(html, /costs \$5\./);
});
