/** Fit the 1920×1080 UI design without cropping. Extra aspect-ratio space extends the canvas. */
export function uiViewport(width:number,height:number) {
 const w=Number.isFinite(width)&&width>0?width:1920;
 const h=Number.isFinite(height)&&height>0?height:1080;
 const scale=Math.min(w/1920,h/1080);
 return {scale,width:Math.max(1920,w/scale),height:Math.max(1080,h/scale)};
}
