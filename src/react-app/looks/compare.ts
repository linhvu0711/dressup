import { z } from "zod";

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 6;

// The Looks page puts the picks in the router state of /looks/compare, and
// history holds whatever it was given, so the compare view parses it.
export const compareState = z.object({
	picked: z.array(z.string()).min(COMPARE_MIN).max(COMPARE_MAX),
});
