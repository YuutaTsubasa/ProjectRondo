import {isTauri,invoke} from '@tauri-apps/api/core';

/** Web/PWA returns to the title; packaged apps use the native application lifecycle. */
export async function exitGame(returnToTitle:()=>void):Promise<void>{
 if(isTauri())await invoke('exit_game');
 else returnToTitle();
}
