import { z } from "zod";
import { ITEM_PICTURE_LIMIT } from "@/pictures/picture";

// Loose strings on purpose, as add_owned_item: a list of 9 must reach the
// store to get a sentence.
export const pictureIdsInput = z
	.array(z.string())
	.optional()
	.describe(
		`The whole picture list, at most ${ITEM_PICTURE_LIMIT}, in order: ids that an upload address answered and ids the item has now. An id left out is deleted for good. Leave pictureIds out to keep the pictures as they are.`,
	);
