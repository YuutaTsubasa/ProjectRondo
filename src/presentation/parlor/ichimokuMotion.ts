/** Procedural idle for 一目元: the VRM has no clips, so the scene drives its bones from these. */
export const ICHIMOKU_MOTION={bob:.06,bobRate:1.3,swayRate:1.7,swayRoot:.05,swayTip:.22,lookLimit:22*Math.PI/180} as const;

/** Vertical float offset in metres. */
export const hoverOffset=(seconds:number)=>ICHIMOKU_MOTION.bob*Math.sin(seconds*ICHIMOKU_MOTION.bobRate);

/** Small local rotations that ripple down each tentacle; deeper segments swing further and later. */
export function tentacleSway(seconds:number,tentacle:number,segment:number,segments:number):{pitch:number;roll:number}{
 const depth=segments<=1?1:segment/(segments-1);
 const amplitude=ICHIMOKU_MOTION.swayRoot+(ICHIMOKU_MOTION.swayTip-ICHIMOKU_MOTION.swayRoot)*depth;
 const phase=seconds*ICHIMOKU_MOTION.swayRate-segment*.55+tentacle*1.37;
 return {pitch:amplitude*Math.sin(phase),roll:amplitude*.6*Math.cos(phase*.8+tentacle)};
}

/**
 * Eye yaw/pitch (radians, model space: +z forward, +y up) towards a target, clamped to the VRM's
 * look range so the iris never leaves the eyelid. Returns rest when the target is behind or invalid.
 */
export function eyeLook(eye:{x:number;y:number;z:number},target:{x:number;y:number;z:number},modelYaw:number):{yaw:number;pitch:number}{
 const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z;
 if(![dx,dy,dz].every(Number.isFinite))return {yaw:0,pitch:0};
 // World offset into model space (rotation about +y by -modelYaw).
 const c=Math.cos(modelYaw),s=Math.sin(modelYaw),x=c*dx-s*dz,z=s*dx+c*dz;
 if(z<=0)return {yaw:0,pitch:0};
 const clamp=(v:number)=>Math.max(-ICHIMOKU_MOTION.lookLimit,Math.min(ICHIMOKU_MOTION.lookLimit,v));
 return {yaw:clamp(Math.atan2(x,z)),pitch:clamp(Math.atan2(dy,Math.hypot(x,z)))};
}
