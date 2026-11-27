import {mkdir,copyFile,rm,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'_site');
const dist=path.join(root,'dist/counterpoint.html');
const circulation=path.join(root,'dist/counterpoint-circulation.html');
for(const file of [dist,circulation])await access(file).catch(()=>{throw new Error(`${path.relative(root,file)} missing: run npm run build first`);});
await rm(out,{recursive:true,force:true});
await mkdir(path.join(out,'play'),{recursive:true});
await mkdir(path.join(out,'circulation'),{recursive:true});
await copyFile(path.join(root,'site/index.html'),path.join(out,'index.html'));
await copyFile(dist,path.join(out,'play/index.html'));
await copyFile(dist,path.join(out,'play/counterpoint.html'));
// The shareable Circulation preview (src/ui/edition.js): nothing on the site links to it.
await copyFile(circulation,path.join(out,'circulation/index.html'));
// Links shared while Pages served the branch pointed at dist/; send them to /circulation/.
await mkdir(path.join(out,'dist'),{recursive:true});
await writeFile(path.join(out,'dist/counterpoint-circulation.html'),'<!doctype html><meta charset="utf-8"><title>Counterpoint · Circulation</title><meta http-equiv="refresh" content="0; url=../circulation/"><link rel="canonical" href="../circulation/"><a href="../circulation/">Counterpoint · Circulation</a>\n');
await writeFile(path.join(out,'.nojekyll'),'');
// og.png: 1200x630 cover crop (centered) of the Ladder plate.
const img=await loadImage(path.join(root,'design/plates/plate1_ladder.png'));
const W=1200,H=630,scale=Math.max(W/img.width,H/img.height);
const sw=W/scale,sh=H/scale,sx=(img.width-sw)/2,sy=(img.height-sh)/2;
const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
ctx.fillStyle='#080C13';ctx.fillRect(0,0,W,H);
ctx.drawImage(img,sx,sy,sw,sh,0,0,W,H);
await writeFile(path.join(out,'og.png'),canvas.toBuffer('image/png'));
console.log('Built _site/ (index, play/, circulation/, og.png)');
