type Point = {x:number;z:number};
/** Atlas north is world +Z. SVG north points up. */
export const bearingTo = (from:Point,to:Point) => (Math.atan2(to.x-from.x,to.z-from.z)*180/Math.PI+360)%360;
export const relativeBearing = (bearing:number,heading:number) => ((bearing-heading)%360+540)%360-180;
export function minimapOffset(from:Point,to:Point,radius:number):{x:number;y:number} {
 const dx=to.x-from.x,dy=from.z-to.z,length=Math.hypot(dx,dy);
 const scale=length>radius?radius/length:1;
 return {x:dx*scale,y:dy===0?0:dy*scale};
}
