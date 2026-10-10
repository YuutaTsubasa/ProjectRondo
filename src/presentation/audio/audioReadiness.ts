/** Bound download/decode readiness, independently of browser autoplay permission. */
export async function waitForAudioReadiness(prepare:()=>Promise<void>,timeoutMs=45_000):Promise<void> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  await Promise.race([
   Promise.resolve().then(prepare),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('音樂載入逾時，請重新載入。')),timeoutMs);}),
  ]);
 } finally {if(timer!==undefined)clearTimeout(timer);}
}
