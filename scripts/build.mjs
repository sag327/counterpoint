import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const modules=new Map();
async function visit(file){
 file=path.resolve(file); if(modules.has(file))return; modules.set(file,'');
 let source=await readFile(file,'utf8');
 const re=/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g;
 let match; const imports=[]; while((match=re.exec(source)))imports.push({whole:match[0],bindings:match[1],target:path.resolve(path.dirname(file),match[2])});
 for(const item of imports){await visit(item.target);source=source.replace(item.whole,`const ${item.bindings.replace(/\bas\b/g,':')} = __modules[${JSON.stringify(path.relative(root,item.target))}];`);}
 const exports=[];source=source.replace(/export\s+(class|function|const|let)\s+(\w+)/g,(_,kind,name)=>{exports.push(name);return `${kind} ${name}`;});
 source=source.replace(/export\s*\{([^}]+)\};?/g,(_,names)=>{exports.push(...names.split(',').map(x=>x.trim()));return '';});
 modules.set(file,source+`\nreturn {${exports.join(',')}};`);
}
await visit(path.join(root,'src/ui/app.js'));
// Dependency order follows the DFS insertion postorder explicitly.
const ordered=[],seen=new Set();
async function order(file){if(seen.has(file))return;seen.add(file);const source=await readFile(file,'utf8');for(const m of source.matchAll(/import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?/g))await order(path.resolve(path.dirname(file),m[1]));ordered.push(file);}
await order(path.join(root,'src/ui/app.js'));
let js='const __modules = {};\n';for(const file of ordered)js+=`__modules[${JSON.stringify(path.relative(root,file))}] = (()=>{\n${modules.get(file)}\n})();\n`;
new vm.Script(js);
const html=await readFile(path.join(root,'src/index.html'),'utf8');const css=(await Promise.all(['styles.css','inspector.css'].map(file=>readFile(path.join(root,'src/ui',file),'utf8')))).join('\n');
await mkdir(path.join(root,'dist'),{recursive:true});await writeFile(path.join(root,'dist/counterpoint.html'),html.replace('/* INLINE_STYLES */',()=>css).replace('/* INLINE_APP */',()=>js.replace(/<\/script/gi,'<\\/script')));
console.log('Built dist/counterpoint.html (self-contained)');
