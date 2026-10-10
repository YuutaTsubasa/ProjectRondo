/** Bounded, edge-directed sector smoothing inspired by the Blender painterly study.
 * Four 3x3 sectors (36 taps), with alpha-weighted statistics. Original coverage is restored.
 * This is intentionally a realtime approximation, not Blender's anisotropic Kuwahara kernel.
 */
export const PORTRAIT_PAINT_FRAGMENT=`
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D paintMask;
uniform vec2 texel;
uniform float radius;
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
 vec4 center=texture2D(textureSampler,vUV);
 float strength=texture2D(paintMask,vUV).r;
 if(center.a<.001||strength<.005){gl_FragColor=center;return;}
 vec3 base=center.rgb/max(center.a,.001);
 vec3 left=texture2D(textureSampler,vUV-vec2(texel.x,0.)).rgb;
 vec3 right=texture2D(textureSampler,vUV+vec2(texel.x,0.)).rgb;
 vec3 down=texture2D(textureSampler,vUV-vec2(0.,texel.y)).rgb;
 vec3 up=texture2D(textureSampler,vUV+vec2(0.,texel.y)).rgb;
 vec2 gradient=vec2(luma(right-left),luma(up-down));
 vec2 tangent=length(gradient)>.012?normalize(vec2(-gradient.y,gradient.x)):normalize(vec2(1.,.42));
 vec2 normal=vec2(-tangent.y,tangent.x);
 vec3 best=base;float bestVariance=100.;
 for(int quadrant=0;quadrant<4;quadrant++){
  float sx=quadrant==0||quadrant==2?-1.:1.;
  float sy=quadrant<2?-1.:1.;
  vec3 sum=vec3(0.);vec3 square=vec3(0.);float weight=0.;
  for(int x=0;x<3;x++){for(int y=0;y<3;y++){
   vec2 delta=(tangent*float(x)*sx+normal*float(y)*sy*.65)*texel*radius*.5;
   vec2 uv=clamp(vUV+delta,texel*.5,vec2(1.)-texel*.5);
   vec4 sampleColor=texture2D(textureSampler,uv);
   vec3 straight=sampleColor.rgb/max(sampleColor.a,.001);
   float w=sampleColor.a;
   sum+=straight*w;square+=straight*straight*w;weight+=w;
  }}
  vec3 mean=sum/max(weight,.001);
  vec3 variance=max(vec3(0.),square/max(weight,.001)-mean*mean);
  float v=luma(variance);
  if(v<bestVariance&&weight>2.){bestVariance=v;best=mean;}
 }
 gl_FragColor=vec4(mix(base,best,strength*.94)*center.a,center.a);
}
`;
