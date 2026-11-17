import { z } from "zod";
import { lookSchema } from "@/looks/look";

// The answers the worker sends and the web app reads, so a renamed key or
// code breaks the check on both sides. Zod only: the worker compiles this.

export const errorCodes = [
	"unauthorized",
	"invalid",
	"conflict",
	"look_limit",
	"not_found",
	"not_in_row",
	"last_square",
	"duplicate",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorAnswer = z.object({
	error: z.enum(errorCodes),
	field: z.string().optional(),
});

export type ErrorAnswer = z.input<typeof errorAnswer>;

export const looksAnswer = z.object({ looks: z.array(lookSchema) });

export type LooksAnswer = z.input<typeof looksAnswer>;
