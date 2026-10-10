<script lang="ts">
 import {inputStatus} from '../input/deviceInput';
 import InputHint from '../input/InputHint.svelte';
 import {REGION_PLACES,REGION_TRAILS,type RegionPlaceId} from '../../domain/region/regionLayout';
 import type {RegionPoint} from '../../domain/region/regionObjectives';
 import atlas from '../../content/regionAtlas.json';
 let {position,selectedId,objectiveId,visited,onSelect}:{position:RegionPoint;selectedId:RegionPlaceId;objectiveId:string|null;visited:(id:string)=>boolean;onSelect:(id:RegionPlaceId)=>void}=$props();
 let zoom=$state(1),cx=$state(-22.5),cy=$state(116.5),markers=$state(true),failed=$state(false);
 let surface:SVGSVGElement;
 let drag:{id:number;x:number;y:number;cx:number;cy:number}|undefined;
 const width=$derived(330/zoom),height=$derived(390/zoom);
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
 export function changeZoom(amount:number){zoom=clamp(zoom+amount,1,3.5);}
 export function currentPosition(){cx=position.x;cy=-position.z;}
 export function overview(){zoom=1;cx=-22.5;cy=116.5;}
 export function toggleMarkers(){markers=!markers;}
 export function focusPlace(id:RegionPlaceId){const p=REGION_PLACES.find(p=>p.id===id);if(p){cx=p.x;cy=-p.z;}}
 function down(e:PointerEvent){if(e.button!==0||(e.target as Element).closest('[role="button"]'))return;surface.focus();drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx,cy};surface.setPointerCapture(e.pointerId);}
 function move(e:PointerEvent){if(!drag||drag.id!==e.pointerId)return;const r=surface.getBoundingClientRect(),scale=Math.min(r.width/width,r.height/height);if(!scale)return;cx=clamp(drag.cx-(e.clientX-drag.x)/scale,atlas.bounds.minX,atlas.bounds.maxX);cy=clamp(drag.cy-(e.clientY-drag.y)/scale,-atlas.bounds.maxZ,-atlas.bounds.minZ);}
 function up(e:PointerEvent){if(drag?.id!==e.pointerId)return;drag=undefined;if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);}
 function wheel(e:WheelEvent){e.preventDefault();changeZoom(e.deltaY<0?.2:-.2);}
 function key(e:KeyboardEvent){const step=20/zoom;if(e.key==='ArrowLeft')cx=clamp(cx-step,atlas.bounds.minX,atlas.bounds.maxX);else if(e.key==='ArrowRight')cx=clamp(cx+step,atlas.bounds.minX,atlas.bounds.maxX);else if(e.key==='ArrowUp')cy=clamp(cy-step,-atlas.bounds.maxZ,-atlas.bounds.minZ);else if(e.key==='ArrowDown')cy=clamp(cy+step,-atlas.bounds.maxZ,-atlas.bounds.minZ);else return;e.preventDefault();e.stopPropagation();}
 function markerKey(e:KeyboardEvent,id:RegionPlaceId){if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onSelect(id);}}
</script>
<div class="atlas-wrap">
 <!-- This SVG is a scoped, keyboard-pannable map; its markers and toolbar also expose named controls. -->
 <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
 <svg bind:this={surface} data-region-atlas class="atlas" viewBox={`${cx-width/2} ${cy-height/2} ${width} ${height}`} role="application" aria-roledescription="可縮放地圖" aria-label="白色王城與周邊地圖，方向鍵移動" tabindex="0" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={()=>drag=undefined} onwheel={wheel} onkeydown={key}>
  <rect x="-1000" y="-1000" width="2000" height="2000" class="ocean"/>
  {#if !failed}<image class="capture" href={`${atlas.image}?v=${atlas.sha256.slice(0,12)}`} x={atlas.bounds.minX} y={-atlas.bounds.maxZ} width={atlas.bounds.maxX-atlas.bounds.minX} height={atlas.bounds.maxZ-atlas.bounds.minZ} onerror={()=>failed=true}/>
  {:else}<g class="fallback"><path d="M-130-57H40V63L73 166 83 225 67 275 20 290H-130Z"/>{#each REGION_TRAILS as trail}<polyline points={trail.map(([x,z])=>`${x},${-z}`).join(' ')}/>{/each}</g>{/if}
  <g class="routes" aria-hidden="true">{#each REGION_TRAILS as trail}<polyline points={trail.map(([x,z])=>`${x},${-z}`).join(' ')}/>{/each}</g>
  {#if markers}{#each REGION_PLACES as place}
   <g class="marker" class:selected={selectedId===place.id} class:visited={visited(place.id)} transform={`translate(${place.x} ${-place.z}) scale(${1/zoom})`} role="button" tabindex="0" aria-label={`選取${place.name}`} aria-pressed={selectedId===place.id} onclick={()=>onSelect(place.id)} onkeydown={e=>markerKey(e,place.id)}>
    <rect class="hit" x="-12" y="-14" width="85" height="28"/>
    <path class="label-bg" d="M3-7H69L74 0 69 7H3Z"/>
    <path class="halo" d="M0-12 12 0 0 12-12 0Z"/><path class="shell" d="M0-8 8 0 0 8-8 0Z"/>
    {#if place.kind==='expedition'}<path class="glyph" d="M-3 3v-4q3-5 6 0v4M-5 3H5"/>{:else if place.kind==='vista'}<path class="glyph" d="m-4 3 3-6 3 4 2-3 2 5Z"/>{:else}<path class="glyph" d="M0-4v5M0 3v1"/>{/if}
    <text x="14" y="2.7">{place.name}</text>
    {#if objectiveId===place.id}<path class="quest" d="m-3-17 3 3 3-3"/>{/if}
   </g>
  {/each}{/if}
  <g class="player" transform={`translate(${position.x} ${-position.z}) scale(${1/zoom})`} aria-label="悠太翼目前位置"><circle r="10"/><path d="M0-7 5 6 0 3-5 6Z"/></g>
 </svg>
 <div class="north" aria-hidden="true">N<span>↑</span></div>
 <div class="zoom"><button onclick={()=>changeZoom(.25)} aria-label="放大地圖">＋</button><span>{Math.round(zoom*100)}%</span><button onclick={()=>changeZoom(-.25)} aria-label="縮小地圖">−</button></div>
 <div class="map-tools"><button onclick={currentPosition} aria-label="回到目前位置"><kbd><InputHint label="T"/></kbd>目前位置</button><button onclick={toggleMarkers} aria-label="顯示地圖標記" aria-pressed={markers}><kbd><InputHint label="R"/></kbd>顯示標記</button><button onclick={overview} aria-label="檢視全區"><span aria-hidden="true">⌖</span>全區</button><span class="mouse-hint">{$inputStatus.device==='gamepad'?'右搖桿 移動 · LT / RT 縮放':$inputStatus.device==='touch'?'拖曳 移動 · ＋ / − 縮放':'滾輪 縮放 · 拖曳 移動'}</span></div>
</div>
<style>
 .atlas-wrap{position:absolute;inset:0 17% 0 14%}.atlas{width:100%;height:calc(100% - 110px);margin-top:8px;display:block;touch-action:none;cursor:grab;outline:none}.atlas:active{cursor:grabbing}.atlas:focus-visible~.north{outline:1px dashed var(--avg-muted);outline-offset:5px}.ocean{fill:#193951}.capture{filter:grayscale(.35) saturate(.7) brightness(.95);opacity:.95}.fallback>path{fill:#415964;stroke:#a8c2c9;stroke-width:.5}.fallback polyline{fill:none;stroke:#ccdae6;stroke-width:2}.routes{fill:none;stroke:#b9daff;stroke-width:.8;stroke-dasharray:2 3;opacity:.35;pointer-events:none}.marker{outline:none;cursor:pointer}.hit{fill:transparent}.label-bg{fill:#101f3dd9;stroke:#88beff66;stroke-width:.4}.shell{fill:#e6f3ff;stroke:#74acff;stroke-width:1.2}.halo{fill:#286bce33;stroke:#91c6ff;stroke-width:.6;opacity:0}.glyph{fill:none;stroke:#294777;stroke-width:1.5;stroke-linejoin:round}.marker text{font:7px var(--font-body);letter-spacing:.6px;fill:#eff6ff;pointer-events:none}.marker.selected .halo,.marker:focus .halo{opacity:1}.marker.selected .shell,.marker:focus .shell{fill:#347dff;stroke:#d9f2ff;filter:drop-shadow(0 0 3px #5ea8ff)}.marker.selected .glyph,.marker:focus .glyph{stroke:white}.marker.selected .label-bg,.marker:hover .label-bg,.marker:focus .label-bg{fill:#244477e8;stroke:#9ed7ff}.marker.visited:not(.selected) .shell{fill:#b8d9e1}.quest{fill:none;stroke:#b9e9ff;stroke-width:1.3}.player{pointer-events:none;filter:drop-shadow(0 0 5px #428fff)}.player circle{fill:#5cafff33;stroke:#88d6ff;stroke-width:.5}.player path{fill:white;stroke:#468cff;stroke-width:1.4}.north{position:absolute;left:20%;top:30px;font:12px var(--font-body);color:var(--avg-light);text-align:center;pointer-events:none}.north span{display:block;font-size:28px}.zoom{position:absolute;left:23%;bottom:105px;display:grid;text-align:center;color:var(--avg-text);background:#102242cc;border:1px solid #87b7ef55}.zoom button{font:22px var(--font-body);padding:0 8px}.zoom span{font-size:9px;padding:4px}.map-tools{position:absolute;bottom:62px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:22px;white-space:nowrap;background:linear-gradient(90deg,#0f2246db,#163566e8,#0f2246db);border-block:1px solid #7cb2f582;padding:12px 18px;color:var(--avg-text);font-size:11px}.map-tools button{font-size:11px;display:flex;align-items:center;gap:7px}.map-tools button[aria-pressed=false]{opacity:.55}.map-tools button>span{font-size:18px}button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}button:hover{color:var(--avg-light)}button:focus-visible{outline:1px solid var(--avg-light);outline-offset:4px}kbd{background:var(--avg-text);color:#182d50;padding:1px 4px;border-radius:2px;font:700 10px var(--font-body)}.mouse-hint{font-size:10px;color:var(--avg-muted)}
 @media(max-width:1100px){.mouse-hint{display:none}.map-tools{gap:15px;padding:11px}.atlas-wrap{inset:0 15% 0 12%}.zoom{left:21%}}
 @media(max-width:700px){.atlas-wrap{inset:132px 0 290px}.north{left:15px;top:5px}.zoom{left:auto;right:12px;bottom:55px}.map-tools{bottom:0;padding:9px;gap:14px}.atlas-wrap .atlas{height:calc(100% - 48px);min-height:160px}}
 @media(max-height:600px) and (min-width:701px){.map-tools{bottom:20px}.zoom{bottom:70px}}
 @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
