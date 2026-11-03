export interface CityBlock {
 readonly id:string; readonly x:number; readonly z:number; readonly width:number; readonly depth:number;
 readonly height:number; readonly baseY:number; readonly shop:boolean;
}
/** Footprints leave a central promenade and two 16 m wide ascent roads. */
export const CITY_BLOCKS:readonly CityBlock[]=[
 ...[65,85].flatMap((z,row)=>(row===0?[-50,-10,10,50]:[-50,-30,10,30]).map((x,i)=>({id:'market-'+row+'-'+i,x,z,width:12,depth:9,height:8+(i%2)*2,baseY:0,shop:true}))),
 ...[121,139].flatMap((z,row)=>[-50,-30,10,30].map((x,i)=>({id:'residential-'+row+'-'+i,x,z,width:12,depth:9,height:10+(i%2)*2,baseY:6,shop:false}))),
 ...[177,201].flatMap((z,row)=>[-78,58].map((x,i)=>({id:'court-'+row+'-'+i,x,z,width:8,depth:10,height:13,baseY:12,shop:false}))),
];
