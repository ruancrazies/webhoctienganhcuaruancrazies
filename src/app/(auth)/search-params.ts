export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
