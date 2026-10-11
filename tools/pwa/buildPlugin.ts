import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Plugin} from 'vite';

export function pwaBuild(): Plugin {
 return {
  name:'rondo-pwa', apply:'build',
  generateBundle(_,bundle) {
   const template=readFileSync(new URL('./service-worker.js',import.meta.url),'utf8');
   const hash=createHash('sha256').update(template);
   for(const name of Object.keys(bundle).sort()) {
    const asset=bundle[name];
    hash.update(name).update(asset.type==='chunk'?asset.code:asset.source);
   }
   for(const path of ['offline.html','manifest.webmanifest','icons/player-192.png','icons/player-512.png','icons/player-maskable-512.png'])
    hash.update(readFileSync(new URL('../../public/'+path,import.meta.url)));
   this.emitFile({type:'asset',fileName:'sw.js',source:template.replace('__BUILD_ID__',hash.digest('hex').slice(0,16))});
  },
 };
}
