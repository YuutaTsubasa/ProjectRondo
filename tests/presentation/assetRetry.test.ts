import {afterEach,expect,it} from 'vitest';
import {FileTools,FileToolsOptions} from '@babylonjs/core/Misc/fileTools';
import {assetRetryDelay,configureAssetRetries} from '../../src/presentation/babylon/assetRetry';
const original=FileTools.DefaultRetryStrategy;
afterEach(()=>{FileTools.DefaultRetryStrategy=original;});
it.each([0,500,502,503,504])('retries transient status %s with bounded backoff',status=>{
 expect([0,1,2,3,4].map(i=>assetRetryDelay('/town/gate.glb',{status},i))).toEqual([500,1000,2000,-1,-1]);
});
it.each([200,400,401,403,404,501])('does not retry status %s',status=>{
 expect(assetRetryDelay('/town/gate.glb',{status},0)).toBe(-1);
});
it('does not retry local file failures',()=>{
 expect(assetRetryDelay('file:///town/gate.glb',{status:0},0)).toBe(-1);
});
it('installs the policy at the Babylon request layer',()=>{
 configureAssetRetries();expect(FileTools.DefaultRetryStrategy).toBe(assetRetryDelay);
 expect(FileToolsOptions.DefaultRetryStrategy).toBe(assetRetryDelay);
});
