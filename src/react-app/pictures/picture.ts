import { z } from "zod";

export const PICTURE_BYTES_MAX = 1_048_576;

export const pictureIdSchema = z.uuid().brand<"PictureId">();

export type PictureId = z.infer<typeof pictureIdSchema>;

export const pictureAddress = (id: PictureId) => `/api/pictures/${id}`;

export const ACCOUNT_PICTURE_LIMIT = 1_000;

// 9 GB of R2's 10 GB free; the 1 GB left holds another project's bucket.
export const STORAGE_BYTES_STOP = 9_000_000_000;

export const MONTH_UPLOAD_STOP = 900_000;

export const ITEM_PICTURE_LIMIT = 8;

// A draft left by a closed tab goes at the account's next upload once it is
// this old.
export const DRAFT_AGE_MS = 86_400_000;
