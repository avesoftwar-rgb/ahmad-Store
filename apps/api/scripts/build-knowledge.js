#!/usr/bin/env node
/*
  Build Knowledge Base JSON from Markdown/text files.
  Usage:
    node apps/api/scripts/build-knowledge.js --src ./external-docs --out ./docs/ground-truth.json --category policies
*/
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { src: './external-docs', out: './docs/ground-truth.json', category: 'policies' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--src') opts.src = args[++i];
    else if (args[i] === '--out') opts.out = args[++i];
    else if (args[i] === '--category') opts.category = args[++i];
  }
  return opts;
}

function readAllFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...readAllFiles(p));
    else if (/\.(md|markdown|txt)$/i.test(e.name)) files.push(p);
  }
  return files;
}

function mdToPlain(md) {
  return String(md || '')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\!\[[^\]]*\]\([^\)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^\)]*\)/g, '')
    .replace(/#+\s?/g, '')
    .replace(/>\s?/g, '')
    .replace(/\*\*?|__|\*|_/g, '')
    .trim();
}

function main() {
  const { src, out, category } = parseArgs();
  if (!fs.existsSync(src)) {
    console.error(`Source folder not found: ${src}`);
    process.exit(1);
  }
  const files = readAllFiles(src);
  if (files.length === 0) {
    console.error('No markdown/text files found in src');
    process.exit(1);
  }

  const docs = files.map((fp, idx) => {
    const raw = fs.readFileSync(fp, 'utf8');
    const text = mdToPlain(raw);
    const title = path.basename(fp).replace(/\.(md|markdown|txt)$/i, '');
    return {
      id: `Doc${idx+1}`,
      question: title,
      answer: text.slice(0, 10000),
      category,
      lastUpdated: new Date().toISOString(),
      sourcePath: path.relative(process.cwd(), fp)
    };
  });

  const outPath = path.resolve(out);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`✅ KB built: ${docs.length} docs → ${outPath}`);
}

main();


