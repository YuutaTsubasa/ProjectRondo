/** Stable ids also keep the original two v1 best-record keys loadable. */
export const STAGE_IDS=['course','palace','course-2','course-3','course-4','course-5','palace-1-2','palace-1-3','palace-1-4','palace-1-5'] as const;
export type StageId=typeof STAGE_IDS[number];
export type ExtraStageId=Exclude<StageId,'course'|'palace'>;
export function isStageId(id:string):id is StageId{return (STAGE_IDS as readonly string[]).includes(id);}
export function stageKind(id:StageId):'course'|'palace'{return id.startsWith('palace')?'palace':'course';}
