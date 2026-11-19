import { z } from "zod";
import { hexSchema } from "@/colour/hex";

export const MANNEQUIN_PARTS = ["skin", "hair"] as const;

export type MannequinPart = (typeof MANNEQUIN_PARTS)[number];

export const mannequinPartSchema = z.enum(MANNEQUIN_PARTS);

export const mannequinSchema = z.object({ skin: hexSchema, hair: hexSchema });

export type Mannequin = z.infer<typeof mannequinSchema>;

export const STARTER_MANNEQUIN: Mannequin = {
	skin: "#D6A27B",
	hair: "#141418",
};
