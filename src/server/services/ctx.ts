import type { Rng } from "../../core/questions";

/** Phụ thuộc có thể thay khi test: đồng hồ và bộ sinh số ngẫu nhiên. */
export type Ctx = { now?: Date; rng?: Rng };

export const nowOf = (ctx: Ctx): Date => ctx.now ?? new Date();
export const rngOf = (ctx: Ctx): Rng => ctx.rng ?? Math.random;
