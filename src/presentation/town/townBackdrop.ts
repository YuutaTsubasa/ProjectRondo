import type {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';

/** Open coastal skyline: two sloping ridges behind the town, with the east sea unobstructed. */
export function createTownBackdrop(scene:Scene):void {
  for(let layer=0;layer<2;layer++){
    const positions:number[]=[],indices:number[]=[],normals:number[]=[];
    const segments=128,rows=5;
    for(let i=0;i<=segments;i++){
      const x=-280+i/segments*430;
      const peak=19+layer*10+7*Math.sin(x*.034+layer)+4*Math.sin(x*.081-layer)+1.5*Math.sin(x*.23);
      for(let row=0;row<rows;row++){
        const t=row/(rows-1);
        positions.push(x,-5+(peak+5)*t,104+layer*55+t*33+Math.sin(x*.049)*7);
      }
    }
    for(let i=0;i<segments;i++)for(let row=0;row<rows-1;row++){
      const a=i*rows+row,b=a+rows;indices.push(a,b,a+1,b,b+1,a+1);
    }
    VertexData.ComputeNormals(positions,indices,normals);
    if(normals.filter((_,i)=>i%3===1).reduce((a,b)=>a+b,0)<0)for(let i=0;i<normals.length;i++)normals[i]*=-1;
    const mesh=new Mesh('town-ridge-'+layer,scene),data=new VertexData();
    data.positions=positions;data.indices=indices;data.normals=normals;data.applyToMesh(mesh);
    const material=new StandardMaterial('town-ridge-material-'+layer,scene);
    material.diffuseColor=Color3.FromHexString(layer?'#839fa8':'#658981');
    material.specularColor=Color3.Black();material.backFaceCulling=false;
    mesh.material=material;mesh.isPickable=false;mesh.freezeWorldMatrix();
  }
}
