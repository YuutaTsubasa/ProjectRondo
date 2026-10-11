<script lang="ts">
 import {REGION_TRAILS,REGION_PLACES,REGION_INTERACTION_PLACES} from '../../domain/region/regionLayout';
 import {TOWN_BOUNDS,TOWN_BUILDINGS} from '../../domain/town/townLayout';
 import type {RegionPoint} from '../../domain/region/regionObjectives';
 import {minimapOffset} from '../hud/hudNavigation';
 import atlas from '../../content/regionAtlas.json';
 let {position,heading=0,playerHeading=180,navigationId}:{position:RegionPoint;heading?:number;playerHeading?:number;navigationId:string|null}=$props();
 const id=$props.id();
 const zoom=1.7;
 let atlasFailed=$state(false);
 // The beacon the HUD distance, compass and prompt all measure to.
 const target=$derived(REGION_INTERACTION_PLACES.find(p=>p.id===navigationId));
 const marker=$derived(target?minimapOffset(position,target,67/zoom):null);
</script>
<div class="minimap" role="img" aria-label="附近地圖，北方朝上">
 <svg viewBox="-88 -88 176 176" aria-hidden="true">
  <defs><clipPath id={id}><circle r="76"/></clipPath></defs>
  <circle r="83" class="outer"/><circle r="78" class="ring"/>
  <g clip-path={`url(#${id})`}>
   <circle r="76" class="water"/>
   <g transform={`scale(${zoom}) translate(${-position.x} ${position.z})`}>
    {#if !atlasFailed}
     <image class="atlas-photo" href={`${atlas.image}?v=${atlas.sha256.slice(0,12)}`} x={atlas.bounds.minX} y={-atlas.bounds.maxZ} width={atlas.bounds.maxX-atlas.bounds.minX} height={atlas.bounds.maxZ-atlas.bounds.minZ} onerror={()=>atlasFailed=true}/>
    {:else}<g transform="scale(1 -1)">
    <path d="M-180 100H42V-70L55-100 73-166 83-225 67-275 20-300H-180Z" class="land"/>
    <path d={`M${TOWN_BOUNDS.minX} ${TOWN_BOUNDS.maxZ}H${TOWN_BOUNDS.maxX}V${TOWN_BOUNDS.minZ}H${TOWN_BOUNDS.minX}Z`} class="town"/>
    <path d={`M0 52V${TOWN_BOUNDS.minZ}M-35 24H36M-32-32H32`} class="road"/>
    {#each REGION_TRAILS as trail}<polyline points={trail.map(([x,z])=>`${x},${z}`).join(' ')} class="road"/>{/each}
    {#each TOWN_BUILDINGS as b}<rect x={b.x-4} y={b.z-4} width="8" height="8" rx="1" class="building"/>{/each}
   </g>{/if}
   </g>
   <circle r="76" fill="#142137" opacity=".2"/>
   <g transform={`scale(${zoom}) translate(${-position.x} ${position.z})`}>
    {#each REGION_PLACES.filter(p=>p.id!==navigationId) as p}<circle cx={p.x} cy={-p.z} r="1.7" class="place"/>{/each}
   </g>
   <g class="camera-heading" transform={`rotate(${heading})`}><path d="M0 0-31-55Q0-69 31-55Z" class="vision"/></g>
   <g class="player-heading" transform={`rotate(${playerHeading})`}><path d="m0-8 5 14-5-3-5 3Z" class="player"/></g>
   {#if marker}<g transform={`translate(${marker.x*zoom} ${marker.y*zoom})`}><path d="m0-7 7 7-7 7-7-7Z" class="target"/><circle r="2" fill="white"/></g>{/if}
  </g>
  <path d="M-82 0h4M78 0h4M0 78v4" class="ticks"/><text y="-77" class="north">N</text>
 </svg>

</div>
<style>
 .atlas-photo{filter:grayscale(.9) brightness(.58)}
 .minimap{width:170px;position:relative;filter:drop-shadow(0 2px 8px #132e4240)}svg{display:block;width:100%;overflow:visible}.outer{fill:#172d4018;stroke:#effaff70;stroke-width:.6}.ring{fill:none;stroke:#f3f9ffd9;stroke-width:.7}.water{fill:#142a42c9}.land{fill:#344557;stroke:#758aa1;stroke-width:1.3}.town{fill:#273543}.road{fill:none;stroke:#b0b8bd;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.building{fill:#81909c;stroke:#b6c2cb;stroke-width:.6}.place{fill:#cad9e4}.vision{fill:#64a4ff20;stroke:none}.player{fill:#c5eeff;stroke:#448cff;stroke-width:1.5;filter:drop-shadow(0 0 4px #508cff)}.target{fill:#3c73ff;stroke:#d2efff;stroke-width:1.3}.ticks{stroke:#e5f3ff;stroke-width:.6}.north{fill:white;font:400 11px var(--font-body);text-anchor:middle}
</style>
