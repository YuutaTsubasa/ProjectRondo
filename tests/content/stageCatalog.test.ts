import {expect,it} from 'vitest';
import {STAGE_CATALOG,getStageInfo} from '../../src/content/stageCatalog';
import {STAGE_IDS,stageKind} from '../../src/domain/stage/stageIds';
import {REGION_PLACES} from '../../src/domain/region/regionLayout';
it('offers exactly one catalog entry and world entrance for each playable stage',()=>{
 expect(STAGE_CATALOG.map(s=>s.id).sort()).toEqual([...STAGE_IDS].sort());
 for(const id of STAGE_IDS){expect(getStageInfo(id).kind).toBe(stageKind(id));expect(REGION_PLACES.filter(p=>p.id===id)).toHaveLength(1);}
 expect(()=>getStageInfo('unknown')).toThrow();
});
it('counts palace knights separately from the renewable traversal cores',()=>{
 expect(['palace-1-2','palace-1-3','palace-1-4','palace-1-5'].map(id=>getStageInfo(id).guards)).toEqual([3,4,10,21]);
 expect(['palace-1-2','palace-1-3','palace-1-4','palace-1-5'].map(id=>getStageInfo(id).coins)).toEqual([17,31,29,57]);
});
