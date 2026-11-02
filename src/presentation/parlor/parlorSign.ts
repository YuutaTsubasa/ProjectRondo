import type {Scene} from '@babylonjs/core/scene';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';

/**
 * Signs reuse the chapter serif; the canvas waits for it so the first frame is not a fallback face.
 * Show it on a BACKSIDE plane: in this right-handed scene that plane faces +z and reads unmirrored.
 */
export async function drawSign(scene:Scene,name:string,lines:readonly string[],width:number,height:number){
 const texture=new DynamicTexture(name,{width,height},scene,true);
 const font='"Rondo Chapter Serif", "Noto Sans TC", serif';
 try{await document.fonts?.load(`600 ${Math.round(height*.5)}px ${font}`,lines.join(''));}catch{/* fall back to the next face */}
 const ctx=texture.getContext() as CanvasRenderingContext2D|null;
 if(!ctx)return texture;
 ctx.fillStyle='#efe6d2';ctx.fillRect(0,0,width,height);
 ctx.strokeStyle='#a68b58';ctx.lineWidth=height*.05;ctx.strokeRect(height*.06,height*.06,width-height*.12,height-height*.12);
 ctx.fillStyle='#2e3a35';ctx.textAlign='center';ctx.textBaseline='middle';
 lines.forEach((line,i)=>{const size=i===0?height*.46:height*.13;ctx.font=`600 ${size}px ${font}`;ctx.fillText(line,width/2,height*(lines.length===1?.53:i===0?.44:.8));});
 texture.update();
 return texture;
}

