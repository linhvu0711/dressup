import { z } from "zod";
import { hexSchema } from "@/colour/hex";
import { mannequinPartSchema } from "@/mannequin/mannequin";
import { setMannequinColour } from "../mannequin-store";
import { action, notAColourCode, type Refusals } from "./action";

type MannequinError = { code: "invalid"; field: "part" | "hex" };

const mannequinRefusals: Refusals<MannequinError> = {
	invalid: (error) => ({
		status: 400,
		body: { error: "invalid", field: error.field },
		text: error.field === "part" ? "A part is skin or hair." : notAColourCode,
	}),
};

// The store checks nothing, so the rules run here: the part first, then the
// hex.
export const mannequinActions = {
	set: action(
		z.object({
			part: z.string().describe("skin or hair."),
			hex: z.string().describe("The colour code, as #8D5524."),
		}),
		mannequinRefusals,
		async ({ db, userId }, input) => {
			const part = mannequinPartSchema.safeParse(input.part);
			if (!part.success)
				return {
					ok: false,
					error: { code: "invalid", field: "part" },
				} as const;
			const hex = hexSchema.safeParse(input.hex);
			if (!hex.success)
				return { ok: false, error: { code: "invalid", field: "hex" } } as const;
			return {
				ok: true,
				value: await setMannequinColour(db, userId, part.data, hex.data),
			};
		},
	),
};
