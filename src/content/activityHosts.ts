import type {StageId} from '../domain/stage/stageIds';
export interface ActivityHost {readonly stageId:StageId;readonly name:string;readonly role:string;readonly greeting:string;readonly uniform:'blue'|'teal'}
/** Existing stages only: hosts are welcome desks, never quest gates. */
export const ACTIVITY_HOSTS:readonly ActivityHost[]=[
 {stageId:'course',name:'嵐恩',role:'天廊領航員',greeting:'想從高處看看王城嗎？我替你開啟白宮天廊。',uniform:'blue'},
 {stageId:'palace',name:'汐亞',role:'引水道巡守',greeting:'水道的巡檢路線開放了，隨時可以出發。',uniform:'teal'},
 {stageId:'course-2',name:'洛德',role:'白柱巡檢員',greeting:'石柱間有一條輕巧的路，來試試身手吧。',uniform:'blue'},
 {stageId:'course-3',name:'晨伊',role:'階庭接待員',greeting:'沿著晨光往上走，露臺就在前方。',uniform:'blue'},
 {stageId:'course-4',name:'璐卡',role:'星廊領航員',greeting:'準備好連續盾衝了嗎？水晶會替你引路。',uniform:'blue'},
 {stageId:'course-5',name:'凱恩',role:'大廳試煉官',greeting:'歡迎來到王宮大廳。王冠巡禮會用上你的全部本領，要出發嗎？',uniform:'blue'},
 {stageId:'palace-1-2',name:'米菈',role:'中庭管理員',greeting:'中庭的懸浮核心已啟動，歡迎來走一趟。',uniform:'teal'},
 {stageId:'palace-1-3',name:'艾洛',role:'露臺巡守',greeting:'天空露臺風景很好，我可以帶你到入口。',uniform:'teal'},
 {stageId:'palace-1-4',name:'柏恩',role:'拱橋守望員',greeting:'長拱橋已開放，過橋時留意腳下。',uniform:'teal'},
 {stageId:'palace-1-5',name:'芙蘭',role:'花園側迴廊接待員',greeting:'在北側露臺歇歇腳吧。花園側迴廊通往雲端，想挑戰這條長路嗎？',uniform:'teal'},
];
export const getActivityHost=(stageId:string):ActivityHost|undefined=>ACTIVITY_HOSTS.find(host=>host.stageId===stageId);
