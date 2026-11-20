import { useEffect, useRef, useState } from "react";
import { RequestError, SignedOut } from "@/data/client";
import { dropDraft, uploadPicture } from "./api";
import { ITEM_PICTURE_LIMIT, type PictureId } from "./picture";
import { shrinkPicture, TooBig } from "./shrink";

type Slot = {
	key: string;
	url: string;
	// saved: the item's own; uploaded: a draft until Save.
	state: "saved" | "uploading" | "failed" | "uploaded";
	id?: PictureId;
	blob?: Blob;
};

// What the slots say under them.
export type PictureNote =
	| "only"
	| "unreadable"
	| "too_big"
	| "account_picture_limit"
	| "storage_full";

export type PictureSlots = ReturnType<typeof usePictureSlots>;

// The pictures of one open item or shop link sheet: the owner's own, and the
// ones picked in it, each shrunk and uploaded as a draft. Save sends what
// settle() gives; Cancel calls discard(), so the drafts go.
export function usePictureSlots(saved: readonly PictureId[]) {
	// A ref, so settle() reads the slots as the uploads left them, not as the
	// last render saw them.
	const slots = useRef<Slot[]>(
		saved.map((id) => ({
			key: id,
			url: `/api/pictures/${id}`,
			state: "saved",
			id,
		})),
	);
	const [, rerender] = useState(0);
	const [note, setNote] = useState<PictureNote | null>(null);
	// Picked files still shrinking hold their place under the limit.
	const shrinking = useRef(0);
	const running = useRef(new Set<Promise<void>>());
	const objectUrls = useRef(new Set<string>());
	const discarded = useRef(false);
	const [saving, setSaving] = useState(false);

	const update = (change: (old: Slot[]) => Slot[]) => {
		slots.current = change(slots.current);
		rerender((n) => n + 1);
	};
	const patch = (key: string, next: Partial<Slot>) =>
		update((old) => old.map((s) => (s.key === key ? { ...s, ...next } : s)));
	const forget = (key: string) => {
		const gone = slots.current.find((s) => s.key === key);
		if (gone && objectUrls.current.delete(gone.url))
			URL.revokeObjectURL(gone.url);
		update((old) => old.filter((s) => s.key !== key));
	};
	const track = (work: Promise<void>) => {
		running.current.add(work);
		void work.finally(() => running.current.delete(work));
	};

	async function send(key: string, blob: Blob) {
		try {
			const id = await uploadPicture(blob);
			// The slot went, or the sheet closed, while the upload ran.
			if (discarded.current || !slots.current.some((s) => s.key === key))
				void dropDraft(id);
			else patch(key, { state: "uploaded", id });
		} catch (error) {
			if (
				error instanceof RequestError &&
				(error.code === "account_picture_limit" ||
					error.code === "storage_full")
			) {
				forget(key);
				setNote(error.code);
			} else if (error instanceof SignedOut) forget(key);
			else patch(key, { state: "failed" });
		}
	}

	async function start(file: File) {
		let blob: Blob;
		try {
			blob = await shrinkPicture(file);
		} catch (error) {
			setNote(error instanceof TooBig ? "too_big" : "unreadable");
			return;
		} finally {
			shrinking.current -= 1;
		}
		// The sheet closed while the picture shrank.
		if (discarded.current) return;
		const key = crypto.randomUUID();
		const url = URL.createObjectURL(blob);
		objectUrls.current.add(url);
		update((old) => [...old, { key, url, state: "uploading", blob }]);
		await send(key, blob);
	}

	useEffect(
		() => () => {
			for (const url of objectUrls.current) URL.revokeObjectURL(url);
		},
		[],
	);

	return {
		list: slots.current,
		note,
		add(files: File[]) {
			setNote(null);
			if (files.some((file) => !file.type.startsWith("image/"))) {
				setNote("only");
				return;
			}
			const room =
				ITEM_PICTURE_LIMIT - slots.current.length - shrinking.current;
			for (const file of files.slice(0, Math.max(0, room))) {
				shrinking.current += 1;
				track(start(file));
			}
			rerender((n) => n + 1);
		},
		retry(key: string) {
			const blob = slots.current.find((s) => s.key === key)?.blob;
			if (!blob) return;
			patch(key, { state: "uploading" });
			track(send(key, blob));
		},
		// A saved picture goes at Save; a draft goes now.
		remove(key: string) {
			const slot = slots.current.find((s) => s.key === key);
			forget(key);
			if (slot?.state === "uploaded" && slot.id) void dropDraft(slot.id);
		},
		// True while settle() waits for the uploads.
		saving,
		// The ids to save, once the uploads that run are done. Cancel stays
		// open while they run; once used, nothing is saved, so this gives null.
		// A failed slot is left out: the person saw Failed and chose Save.
		async settle(): Promise<PictureId[] | null> {
			setSaving(true);
			while (running.current.size > 0)
				await Promise.allSettled([...running.current]);
			setSaving(false);
			if (discarded.current) return null;
			return slots.current.flatMap((s) =>
				(s.state === "saved" || s.state === "uploaded") && s.id ? [s.id] : [],
			);
		},
		discard() {
			discarded.current = true;
			for (const s of slots.current)
				if (s.state === "uploaded" && s.id) void dropDraft(s.id);
		},
		// The slots plus the picked files that are still shrinking.
		get taken() {
			return slots.current.length + shrinking.current;
		},
	};
}
