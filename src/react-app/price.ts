import { z } from "zod";

export const PRICE_MAX = 999_999_999;

// A price in whole VND; null when the user leaves it empty.
export const priceSchema = z.number().int().min(1).max(PRICE_MAX).nullable();
