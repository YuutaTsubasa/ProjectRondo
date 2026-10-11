/** Fit the 1920×1080 UI design without cropping. Extra aspect-ratio space extends the canvas. */
export function uiViewport(width:number,height:number) {
 const w=Number.isFinite(width)&&width>0?width:1920;
 const h=Number.isFinite(height)&&height>0?height:1080;
 const scale=Math.min(w/1920,h/1080);
 // scale is the tighter fit, so the canvas only ever grows past 1920×1080, never shrinks below it.
 return {scale,width:w/scale,height:h/scale};
}
