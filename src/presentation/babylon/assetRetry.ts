import {FileTools} from '@babylonjs/core/Misc/fileTools';

/** Retry only network failures and transient server errors, at most three times. */
export function assetRetryDelay(url:string,request:{readonly status:number},retryIndex:number):number {
 if(url.startsWith('file:')||retryIndex>=3)return -1;
 if(![0,500,502,503,504].includes(request.status))return -1;
 return 500*2**retryIndex;
}

/** Configure before mounting any scene; Babylon owns cancellation and retry cleanup. */
export function configureAssetRetries():void {
 FileTools.DefaultRetryStrategy=assetRetryDelay;
}
