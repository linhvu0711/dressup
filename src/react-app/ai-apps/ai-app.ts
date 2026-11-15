import { z } from "zod";

// The one shape of a connected AI app, so the server's answer and the
// page's parse are the same. The id is the id of its allow row.
export const aiAppSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	logo: z.string().nullable(),
	connectedAt: z.iso.datetime(),
});

export type AiApp = z.infer<typeof aiAppSchema>;
