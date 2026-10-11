import {readFile,writeFile,cp,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function prepareManifest(source) {
 let count=0;
 const result=source.replace(/<activity\b[^>]*>/g,tag=>{
  if(!/android:name="\.MainActivity"/.test(tag))return tag;
  count++;
  return tag.replace(/\s+android:screenOrientation="[^"]*"/g,'').replace(/>$/,' android:screenOrientation="sensorLandscape">');
 });
 if(count!==1)throw new Error('Expected exactly one generated MainActivity');
 return result;
}
const marker='// Project Rondo: public test-only debug signing';
export function prepareGradle(source) {
 if(source.includes(marker))return source;
 return source+`\n${marker}
// This deliberately public key must NEVER be used for a release build.
android.signingConfigs.getByName("debug") {
    storeFile = file("../../../../tools/android/playtest.keystore")
    storePassword = "android"
    keyAlias = "androiddebugkey"
    keyPassword = "android"
}
`;
}

async function main() {
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const app=resolve(root,'src-tauri/gen/android/app');
 const manifest=resolve(app,'src/main/AndroidManifest.xml');
 const gradle=resolve(app,'build.gradle.kts');
 const icons=resolve(root,'.superpowers/android-icons/android');
 await access(resolve(root,'tools/android/playtest.keystore'));
 await access(resolve(icons,'mipmap-mdpi/ic_launcher.png'));
 // Validate both generated files before writing either one.
 const manifestText=prepareManifest(await readFile(manifest,'utf8'));
 const gradleText=prepareGradle(await readFile(gradle,'utf8'));
 await writeFile(manifest,manifestText);
 await writeFile(gradle,gradleText);
 await cp(icons,resolve(app,'src/main/res'),{recursive:true});
 console.log('Android playtest prepared: landscape, portrait icons, debug-only signing.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
