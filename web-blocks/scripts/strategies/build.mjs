#!/usr/bin/env node
/**
 * Build the BIOBUZZ strategy examples: <name>.src.js + the helpers it uses from lib.src.js,
 * compiled with js2blk.mjs into examples/ (public/examples is a symlink to it).
 * Usage: node scripts/strategies/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './js2blk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
export const STRATEGIES = {
  hive: 'StarterBot_StrategyHive.blk',
  flower: 'StarterBot_StrategyFlower.blk',
  hybrid: 'StarterBot_StrategyHybrid.blk',
};

/** Source of strategy `name` plus only the lib helpers it uses (transitively). */
export function strategySource(name) {
  const lib = fs.readFileSync(path.join(here, 'lib.src.js'), 'utf8');
  const src = fs.readFileSync(path.join(here, `${name}.src.js`), 'utf8');
  const fns = [...lib.matchAll(/(\/\*\*[\s\S]*?\*\/\s*)?function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?\n\}\n/g)].map((m) => ({ name: m[2], text: m[0] }));
  const used = new Set();
  const visit = (text) => {
    for (const f of fns) {
      if (!used.has(f.name) && new RegExp(`\\b${f.name}\\(`).test(text)) {
        used.add(f.name);
        visit(f.text);
      }
    }
  };
  visit(src);
  return { source: `${src}\n${fns.filter((f) => used.has(f.name)).map((f) => f.text).join('\n')}`, helpers: [...used] };
}

export function buildStrategy(name) {
  return compile(strategySource(name).source);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const [name, file] of Object.entries(STRATEGIES)) {
    const out = buildStrategy(name);
    fs.writeFileSync(path.join(root, 'examples', file), out);
    console.log(`${file}: ${out.length} bytes, helpers: ${strategySource(name).helpers.join(', ')}`);
  }
}
