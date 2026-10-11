import {gamepadProfile} from './gamepadProfile';
export interface GamepadDiagnostic {available:boolean;message:string;pads:Array<{id:string;mapping:string;supported:boolean;buttons:number;axes:number;pressed:string;sticks:string}>;}
/** Read-only diagnostics show both the browser mapping and any supported fallback. */
export function inspectGamepads(secure:boolean,read:(()=>readonly (Gamepad|null)[])|undefined,userAgent=''):GamepadDiagnostic {
 if(!secure)return {available:false,message:'此網址不是安全連線。請改用 HTTPS 網址，Chrome 才能提供手把輸入。',pads:[]};
 if(!read)return {available:false,message:'此瀏覽器沒有提供 Gamepad API。請使用最新版 Chrome。',pads:[]};
 try{
  const pads=Array.from(read()).filter((p):p is Gamepad=>!!p&&p.connected).map(p=>{const profile=gamepadProfile(p,userAgent);return {id:p.id,mapping:p.mapping||(profile==='android'?'未提供標準配置 → Android 相容配置':'未提供標準配置'),supported:profile!==null,buttons:p.buttons.length,axes:p.axes.length,pressed:p.buttons.flatMap((b,i)=>b.pressed||b.value>.55?[String(i)]:[]).join(', ')||'—',sticks:p.axes.map(a=>a.toFixed(2)).join(' / ')};});
  return {available:true,message:pads.length?(pads.some(p=>p.supported)?'已偵測可用手把配置。放開按鍵與搖桿後，再按 A／× 確認。':'瀏覽器已偵測手把，但未提供標準按鍵配置；目前遊戲尚未套用此裝置的配置。'):'尚未偵測手把。請先連接手把、點一下遊戲畫面，再按任意手把按鍵。',pads};
 }catch{return {available:false,message:'瀏覽器禁止讀取手把。請直接開啟 HTTPS 遊戲網址，避免從嵌入頁面啟動。',pads:[]};}
}
