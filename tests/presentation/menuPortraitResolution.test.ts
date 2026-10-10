// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({setSize:vi.fn(),invalidate:vi.fn()}));
vi.mock('@babylonjs/core/Engines/engine',()=>({Engine:class{resize(){}setHardwareScalingLevel(){}getHardwareScalingLevel(){return 1;}setSize=mock.setSize;}}));
vi.mock('../../src/presentation/menu/menuPortraitScene',()=>({createMenuPortraitScene:()=>({invalidate:mock.invalidate})}));
import {mountMenuPortrait} from '../../src/presentation/menu/menuPortraitRuntime';
it('renders portrait at its visible size rather than the scaled design-canvas size',()=>{
 const canvas=document.createElement('canvas');
 vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({width:460,height:540} as DOMRect);
 const renderer=mountMenuPortrait(canvas);renderer.resize();
 expect(mock.setSize).toHaveBeenCalledWith(460,540);
 expect(mock.invalidate).toHaveBeenCalledOnce();
});
