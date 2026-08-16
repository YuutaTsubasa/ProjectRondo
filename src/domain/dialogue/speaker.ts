/** Who speaks a line. Branded string; the value is the display name. */
export type Speaker = string & { readonly __brand: 'Speaker' };
export const speaker = (name: string): Speaker => name as Speaker;
