/** Which portrait to show for a line. Branded string. */
export type PortraitKey = string & { readonly __brand: 'PortraitKey' };
export const portraitKey = (value: string): PortraitKey => value as PortraitKey;
