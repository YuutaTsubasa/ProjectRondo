import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Shadows } from '../babylon/shadows';
import { PALACE_LAYOUT } from '../../domain/palace/palaceLayout';
import type { PalaceRun } from '../../domain/palace/palaceRun';

export function createPalaceScenery(scene: Scene, shadows: Shadows) {
  const stone = new PBRMaterial('palaceIvory', scene);
  stone.albedoColor = Color3.FromHexString('#e9e6dc'); stone.roughness = .78; stone.metallic = .03;
  const side = new PBRMaterial('palaceBlueStone',scene);
  side.albedoColor = Color3.FromHexString('#8297aa'); side.roughness = .82; side.metallic = .04;
  const trim = new PBRMaterial('palaceGold',scene);
  trim.albedoColor = Color3.FromHexString('#b6a779'); trim.metallic = .68; trim.roughness = .35;
  const glow = new StandardMaterial('palaceAzure',scene);
  glow.diffuseColor = Color3.FromHexString('#458dab'); glow.emissiveColor = Color3.FromHexString('#266581');
  const makeBox = (name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat=stone) => {
    const m=CreateBox(name,{width:w,height:h,depth:d},scene);
    m.position.set(x,y,z); m.material=mat; m.isPickable=false;
    shadows.cast(m); shadows.receive(m); return m;
  };
  const texture = (file:string,alpha:boolean) => {
    const t=new Texture('/palace/'+file,scene,false,true,Texture.TRILINEAR_SAMPLINGMODE);
    t.hasAlpha=alpha; return t;
  };
  const tiles=new StandardMaterial('originalPalaceTiles',scene);
  tiles.diffuseTexture=texture('white_palace_platform_tiles.webp',true);
  tiles.useAlphaFromDiffuseTexture=true; tiles.backFaceCulling=false;
  tiles.diffuseColor=new Color3(.87,.9,.94); tiles.specularColor=Color3.Black();
  for(const [index,p] of PALACE_LAYOUT.platforms.entries()) {
    const cx=p.x+p.width/2, d=3.2;
    makeBox('palacePlatform'+index,cx,p.y-p.height/2,0,p.width,p.height,d,side);
    // Inset cornice layers make the front edge read as carved stone, with a precise collision top.
    makeBox('palaceTop'+index,cx,p.y-.10,0,p.width,.2,d+.12);
    makeBox('palaceCornice'+index,cx,p.y-.33,0,p.width+.12,.12,d+.16);
    makeBox('palaceLowerTrim'+index,cx,p.y-p.height+.08,0,p.width+.06,.16,d+.04);
    makeBox('palaceInlay'+index,cx,p.y-.47,d/2+.014,p.width-.08,.055,.035,trim);
    const face=CreatePlane('palaceTileFacing'+index,{width:p.width,height:.65},scene);
    face.position.set(cx,p.y-.82,d/2+.021); face.material=tiles;
    // Repeat only the middle third of the original tile sheet along the face.
    const uv=face.getVerticesData('uv');
    if(uv){const repeats=Math.max(1,Math.round(p.width/1.28)); for(let i=0;i<uv.length;i+=2)uv[i]=1/3+uv[i]*repeats/3; face.setVerticesData('uv',uv);}
    for(let x=p.x+.5;x<p.x+p.width-.35;x+=2.6)
      makeBox('palaceJoint',x,p.y-.65,1.63,.045,.32,.035,trim);
    if(p.width>5) {
      for(const x of [p.x+.65,p.x+p.width-.65]){
        makeBox('palaceSupport',x,p.y-2.6,-.35,.68,3,1.1);
        makeBox('palaceSupportFoot',x,p.y-4.1,-.35,.9,.18,1.3,side);
      }
    }
  }
  // Three repeating camera-following image layers retain the original palace composition.
  const layers=[
    {file:'white_palace_sky.webp',z:-36,height:70,width:124.45,factor:0,alpha:false,y:0},
    {file:'white_palace_far_bg.webp',z:-26,height:27,width:48,factor:.08,alpha:true,y:6},
    {file:'white_palace_mid_bg_loop.webp',z:-15,height:21,width:74.67,factor:.18,alpha:true,y:5},
  ].map(layer=>{
    const mat=new StandardMaterial('background_'+layer.file,scene);
    mat.disableLighting=true; mat.emissiveTexture=texture(layer.file,layer.alpha);
    mat.diffuseColor=Color3.Black(); mat.emissiveColor=Color3.Black(); mat.backFaceCulling=false;
    mat.useAlphaFromDiffuseTexture=false; mat.opacityTexture=layer.alpha?mat.emissiveTexture:null;
    mat.fogEnabled=false; mat.disableDepthWrite=true;
    const planes=[-1,0,1].map(i=>{
      const mesh=CreatePlane('palaceBackdrop',{width:layer.width,height:layer.height},scene);
      mesh.position.set(i*layer.width,layer.y,layer.z); mesh.material=mat; mesh.isPickable=false;
      mesh.alphaIndex=layer.z; return mesh;
    });
    return {...layer,planes};
  });
  const gold=new PBRMaterial('palaceCoinGold',scene);
  gold.albedoColor=Color3.FromHexString('#ffd16b'); gold.metallic=.7;gold.roughness=.24;
  gold.emissiveColor=new Color3(.13,.065,.01);
  const coins=PALACE_LAYOUT.coins.map((p,i)=>{
    const m=CreateTorus('palaceCoin'+i,{diameter:.48,thickness:.10,tessellation:24},scene);
    m.position.set(p.x,p.y,0); m.rotation.x=Math.PI/2; m.material=gold; return m;
  });
  const checkpoints=PALACE_LAYOUT.checkpoints.map((p,i)=>{
    makeBox('checkpointBase'+i,p.x,p.y+.08,-.75,.9,.16,.65,side);
    makeBox('checkpointPost'+i,p.x,p.y+1.1,-.75,.12,2,.12,trim);
    const ring=CreateTorus('checkpointRing'+i,{diameter:.58,thickness:.055,tessellation:36},scene);
    ring.rotation.x=Math.PI/2;ring.position.set(p.x,p.y+1.9,-.75);ring.material=glow;
    return ring;
  });
  const g=PALACE_LAYOUT.goal;
  makeBox('goalLeft',g.x-.85,g.y+1.65,-.6,.28,3.3,.55);
  makeBox('goalRight',g.x+.85,g.y+1.65,-.6,.28,3.3,.55);
  makeBox('goalLintel',g.x,g.y+3.3,-.6,2.1,.25,.7);
  const goalRing=CreateTorus('palaceGoal',{diameter:1.3,thickness:.09,tessellation:56},scene);
  goalRing.rotation.x=Math.PI/2;goalRing.position.set(g.x,g.y+1.7,-.65);goalRing.material=glow;
  const beam=CreateCylinder('goalPedestal',{diameter:1.4,height:.14,tessellation:48},scene);
  beam.position.set(g.x,g.y+.07,-.5);beam.material=trim;
  return {update(run:PalaceRun,cameraX:number){
    for(const layer of layers) {
      const offset=((cameraX*layer.factor)%layer.width+layer.width)%layer.width;
      layer.planes.forEach((mesh,i)=>{mesh.position.x=cameraX-offset+(i-1)*layer.width;});
    }
    coins.forEach((m,i)=>{m.setEnabled(!run.collected.includes(i));m.rotation.y=run.elapsed*1.8+i*.23;});
    checkpoints.forEach((m,i)=>{m.scaling.setAll(i<=run.checkpoint?1.12:1);m.rotation.z=run.elapsed*.35;});
    goalRing.rotation.z=run.elapsed*.3;
  }};
}
