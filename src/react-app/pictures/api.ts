import { remove, request } from "@/data/client";
import { pictureAnswer } from "@/data/contract";
import { type PictureId, pictureAddress } from "./picture";

export const uploadPicture = async (blob: Blob): Promise<PictureId> =>
	(
		await request("POST", "/api/pictures", {
			body: blob,
			answer: pictureAnswer,
		})
	).picture.id;

// A draft that fails to go is swept by the server a day later.
export const dropDraft = (id: PictureId) =>
	remove(pictureAddress(id)).catch(() => {});
