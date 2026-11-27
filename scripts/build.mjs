// Single-file build: inlines every ES module reachable from src/ui/app.js into one
// classic script, plus the styles. No network requests at run time.
//
// Supported module syntax (deliberately small):
//   import { a, b as c } from './x.js';     named imports
//   import x from './data.json' with { type: 'json' };   JSON as the default export
//   import x from './notes.md' with { type: 'text' };    text as the default export (build only)
//   export function|class|const|let name, export { a, b }
//
// The protocol runner's Web Worker (src/lab/worker.js) is bundled the same way
// into a second script, embedded as <script type="text/plain" id="protocol-worker-source">.
// The app turns it into a Blob URL at run time (see src/ui/lab-panel.js).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const IMPORT = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"](\s+with\s*\{[^}]*\})?\s*;?/g;

async function bundle(entry) {
  const modules = new Map();
  const ordered = [];
  async function visit(file) {
    file = path.resolve(file);
    if (modules.has(file)) return;
    modules.set(file, '');
    const ext = path.extname(file);
    const raw = await readFile(file, 'utf8');
    if (ext === '.json') {
      JSON.parse(raw);
      modules.set(file, `return { default: Object.freeze(${raw.trim()}) };`);
      ordered.push(file);
      return;
    }
    if (ext !== '.js') {
      modules.set(file, `return { default: ${JSON.stringify(raw)} };`);
      ordered.push(file);
      return;
    }
    let source = raw;
    const imports = [];
    for (const match of raw.matchAll(IMPORT)) {
      imports.push({ whole: match[0], bindings: match[1].trim(), target: path.resolve(path.dirname(file), match[2]) });
    }
    for (const item of imports) {
      await visit(item.target);
      const key = JSON.stringify(path.relative(root, item.target));
      const binding = item.bindings.startsWith('{')
        ? `const ${item.bindings.replace(/\bas\b/g, ':')} = __modules[${key}];`
        : `const ${item.bindings} = __modules[${key}].default;`;
      source = source.replace(item.whole, () => binding);
    }
    const exports = [];
    source = source.replace(/export\s+(class|function|const|let)\s+(\w+)/g, (_, kind, name) => { exports.push(name); return `${kind} ${name}`; });
    source = source.replace(/export\s*\{([^}]+)\};?/g, (_, names) => { exports.push(...names.split(',').map(x => x.trim())); return ''; });
    modules.set(file, `${source}\nreturn {${exports.join(',')}};`);
    ordered.push(file);
  }
  await visit(path.join(root, entry));
  let js = 'const __modules = {};\n';
  for (const file of ordered) js += `__modules[${JSON.stringify(path.relative(root, file))}] = (()=>{\n${modules.get(file)}\n})();\n`;
  new vm.Script(js);
  return js;
}

const escapeScript = text => text.replace(/<\/script/gi, '<\\/script');
const app = await bundle('src/ui/app.js');
const worker = await bundle('src/lab/worker.js');
const html = await readFile(path.join(root, 'src/index.html'), 'utf8');
const css = (await Promise.all(['src/ui/styles.css', 'src/ui/inspector.css', 'src/lab/lab.css', 'src/ui/study.css']
  .map(file => readFile(path.join(root, file), 'utf8')))).join('\n');
const out = html
  .replace('/* INLINE_STYLES */', () => css)
  .replace('/* INLINE_WORKER */', () => escapeScript(worker))
  .replace('/* INLINE_APP */', () => escapeScript(app));
if (/(?:src|href)\s*=\s*["']https?:/i.test(out)) throw new Error('Build output references a network resource');
// `--out <file>` writes elsewhere (the integration test builds into a temporary directory).
const outIndex = process.argv.indexOf('--out');
const target = outIndex > 0 ? path.resolve(process.argv[outIndex + 1]) : path.join(root, 'dist/counterpoint.html');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, out);
console.log(`Built ${path.relative(root, target)} (self-contained, ${(out.length / 1024).toFixed(0)} KB)`);
