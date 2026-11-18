import { z } from "zod";

export const PICTURE_BYTES_MAX = 1_048_576;

export const pictureIdSchema = z.uuid().brand<"PictureId">();

export type PictureId = z.infer<typeof pictureIdSchema>;
