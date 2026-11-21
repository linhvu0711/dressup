import { z } from "zod";
import {
	ACCOUNT_PICTURE_LIMIT,
	ITEM_PICTURE_LIMIT,
	type PictureId,
	pictureIdSchema,
} from "@/pictures/picture";
import {
	addPicture,
	deleteDraft,
	type PictureError,
	readPicture,
} from "../picture-store";
import type { Result } from "../result";
import { action, type Refusal, type Refusals } from "./action";

// Loose strings on purpose, as add_owned_item: a list of 9 must reach the
// store to get a sentence.
export const pictureIdsInput = z
	.array(z.string())
	.optional()
	.describe(
		`The whole picture list, at most ${ITEM_PICTURE_LIMIT}, in order: ids that an upload address answered and ids the item has now. An id left out is deleted for good. Leave pictureIds out to keep the pictures as they are.`,
	);

type PictureActionError = PictureError | { code: "not_stored" };

const notStored =
	"dressup could not store the picture and kept nothing. Try again with a new upload address.";

// The upload address spends itself on every answer, so each sentence says to
// use a new one.
const pictureRefusals: Refusals<PictureActionError> = {
	invalid: (error) => ({
		status: 400,
		body: { error: "invalid", field: error.field },
		text: "This file is not a JPEG, PNG, or WebP picture. Send one of these to a new upload address.",
	}),
	account_picture_limit: () => ({
		status: 409,
		body: { error: "account_picture_limit" },
		text: `You have ${ACCOUNT_PICTURE_LIMIT.toLocaleString("en")} pictures. That is the limit. Take pictures off an owned item or a shop link to add new ones.`,
	}),
	// The web app's words, src/react-app/pictures/PictureSlots.tsx.
	storage_full: () => ({
		status: 507,
		body: { error: "storage_full" },
		text: "Picture storage is full. No new pictures for now.",
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No picture with this id.",
	}),
	not_stored: () => ({
		status: 500,
		body: { error: "not_stored" },
		text: notStored,
	}),
};

// The body limit refuses before an action runs.
export const tooLarge: Omit<Refusal, "code"> = {
	status: 413,
	body: { error: "too_large" },
	text: "This picture is over 1 MB. Shrink it to 1 MB or less and send it to a new upload address.",
};

const id = z
	.string()
	.describe("A picture id from list_owned_items or list_wishes.");

export const pictureActions = {
	add: action(
		z.object({ bytes: z.instanceof(ArrayBuffer) }),
		pictureRefusals,
		async (
			{ db, pictures, userId },
			{ bytes },
		): Promise<Result<{ id: PictureId }, PictureActionError>> => {
			try {
				return await addPicture(db, pictures, userId, bytes);
			} catch {
				// addPicture takes its row and count back before it throws.
				return { ok: false, error: { code: "not_stored" } };
			}
		},
	),
	read: action(
		z.object({ id }),
		pictureRefusals,
		async ({ db, pictures, userId }, input) => {
			const parsed = pictureIdSchema.safeParse(input.id);
			if (!parsed.success)
				return { ok: false, error: { code: "not_found" } } as const;
			return readPicture(db, pictures, userId, parsed.data);
		},
	),
	deleteDraft: action(
		z.object({
			id: z
				.string()
				.describe(
					"A picture id that an upload address answered and that no owned item or shop link holds yet.",
				),
		}),
		pictureRefusals,
		({ db, pictures, userId }, { id }) => deleteDraft(db, pictures, userId, id),
	),
};
