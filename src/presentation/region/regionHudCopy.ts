import type {RegionChapter} from '../../domain/region/regionProgress';
/** Short actionable copy for the compact HUD; the atlas keeps the full story titles/details. */
export const regionHudCopy:Record<RegionChapter,{title:string;instruction:string}>={
 arrival:{title:'聽聽王城的聲音',instruction:'確認港邊發生了什麼'},
 signal:{title:'前往草原白石環',instruction:'調查回聲管的訊號'},
 relay:{title:'前往白宮天廊',instruction:'白塔廣場西北側 · 修復中繼台'},
 'relay-report':{title:'接聽中繼台的回覆',instruction:'與澄音確認訊號'},
 aqueduct:{title:'前往白宮引水道',instruction:'解除水道末端封鎖'},
 'aqueduct-report':{title:'確認港道的變化',instruction:'接聽回聲管'},
 homecoming:{title:'返回白塔廣場',instruction:'與澄音確認船隻進港'},
 complete:{title:'第一章完成',instruction:'自由探索 · 旅途仍在繼續'},
};
