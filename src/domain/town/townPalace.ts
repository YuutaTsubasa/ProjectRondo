import type {TownSurface} from './townTerraces';

/** Same elevation as the royal forecourt: no loading screen or invisible step at the gate. */
export const PALACE_FLOOR_Y=12;
export const PALACE_SURFACES:readonly TownSurface[]=[
 {id:'palace-courtyard',minX:-44,maxX:40,minZ:209,maxZ:229,fromY:12,toY:12,axis:'z'},
 {id:'palace-great-hall',minX:-38,maxX:18,minZ:229,maxZ:277,fromY:12,toY:12,axis:'z'},
 {id:'palace-sea-cloister',minX:18,maxX:40,minZ:229,maxZ:277,fromY:12,toY:12,axis:'z'},
 {id:'palace-view-terrace',minX:-44,maxX:40,minZ:277,maxZ:291,fromY:12,toY:12,axis:'z'},
];
/** Both public doors and the open gallery form a loop from the old forecourt. */
export const PALACE_WALK_ROUTE:readonly (readonly [number,number])[]=[
 [-10,188],[-10,217],[-10,241],[-10,267],[-10,284],[29,284],[29,267],[29,217],[-10,217],
];
