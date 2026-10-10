import type {DeviceStatus} from './deviceInput';
export function inputHint(key:string,status:Pick<DeviceStatus,'device'|'family'>):string{
 if(status.device==='keyboard')return key;
 if(status.device==='touch')return ({'W A S D':'左搖桿',SHIFT:'步行',SPACE:'跳躍',J:'揮劍',E:'互動',M:'地圖',Esc:'返回',ESC:'返回','↑ ↓':'點選',Enter:'點選',T:'目前位置',R:'標記',F:'點選'} as Record<string,string>)[key]??'點選';
 const ps=status.family==='playstation',confirm=ps?'×':'A',back=ps?'○':'B',attack=ps?'□':'X',top=ps?'△':'Y';
 return ({'W A S D':'左搖桿',SHIFT:ps?'L1':'LB',SPACE:confirm,J:attack,E:attack,M:top,Esc:back,ESC:back,PAUSE:ps?'Options':'Menu','↑ ↓':'十字鍵',Enter:confirm,T:top,R:attack,F:confirm} as Record<string,string>)[key]??key;
}
