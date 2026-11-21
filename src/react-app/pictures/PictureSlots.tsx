import { cn } from "cn";
import { ImagePlus, LoaderCircle, RotateCw, X } from "lucide-react";
import { useRef } from "react";
import { ACCOUNT_PICTURE_LIMIT, ITEM_PICTURE_LIMIT } from "./picture";
import type { PictureNote, PictureSlots as Slots } from "./usePictureSlots";

export const PICTURES_LABEL = `Pictures (up to ${ITEM_PICTURE_LIMIT})`;

const PICTURE_TEXT: Record<PictureNote | "limit", string> = {
	limit: `${ITEM_PICTURE_LIMIT} pictures is the limit for one item.`,
	only: "Only pictures.",
	unreadable: "This picture cannot be read. Try a JPEG or PNG.",
	too_big: "This picture is too big, even after shrinking. Try a smaller one.",
	account_picture_limit: `You have ${ACCOUNT_PICTURE_LIMIT.toLocaleString("en-US")} pictures. That is the limit. Delete some to add new ones.`,
	storage_full: "Picture storage is full. No new pictures for now.",
};

const ALERT = "text-[13px] text-destructive";

const SLOT = "size-16 rounded-[12px] border border-input bg-muted";

// The row of picture slots in the item or shop link sheet, then a "+" slot that opens the
// system's picker. limitHit is the server's picture_limit answer to a Save.
export function PictureSlots({
	slots,
	limitHit,
}: {
	slots: Slots;
	limitHit: boolean;
}) {
	const input = useRef<HTMLInputElement>(null);
	const atLimit = limitHit || slots.taken >= ITEM_PICTURE_LIMIT;
	return (
		<div className="flex flex-col gap-2">
			<ul aria-label="Pictures" className="flex flex-wrap gap-[10px] pt-1.5">
				{slots.list.map((slot, i) => (
					<li
						key={slot.key}
						aria-label={`Picture ${i + 1}`}
						aria-busy={slot.state === "uploading" ? true : undefined}
						className="relative"
					>
						{slot.state === "failed" ? (
							<div
								className={cn(
									SLOT,
									"flex flex-col items-center justify-center gap-0.5",
								)}
							>
								<span className="text-[12.5px] text-destructive">Failed</span>
								<button
									type="button"
									aria-label="Try again"
									title="Try again"
									className="grid size-7 place-items-center rounded-full text-foreground hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"
									onClick={() => slots.retry(slot.key)}
								>
									<RotateCw size={15} strokeWidth={1.9} aria-hidden />
								</button>
							</div>
						) : (
							<>
								<img
									src={slot.url}
									alt=""
									className={cn(
										SLOT,
										"object-cover",
										slot.state === "uploading" && "opacity-50",
									)}
								/>
								{slot.state === "uploading" ? (
									<LoaderCircle
										size={20}
										strokeWidth={1.9}
										aria-hidden
										className="absolute inset-0 m-auto animate-spin motion-reduce:animate-none"
									/>
								) : null}
							</>
						)}
						<button
							type="button"
							aria-label="Remove picture"
							title="Remove picture"
							className="absolute -top-1.5 -right-1.5 grid size-[22px] place-items-center rounded-full bg-foreground text-background focus-visible:outline-2 focus-visible:outline-ring"
							onClick={() => slots.remove(slot.key)}
						>
							<X size={13} strokeWidth={2.2} aria-hidden />
						</button>
					</li>
				))}
				{atLimit ? null : (
					<li>
						<button
							type="button"
							aria-label="Add pictures"
							title="Add pictures"
							className="grid size-16 place-items-center rounded-[12px] border border-dashed border-input text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
							onClick={() => input.current?.click()}
						>
							<ImagePlus size={20} strokeWidth={1.9} aria-hidden />
						</button>
					</li>
				)}
			</ul>
			<input
				ref={input}
				type="file"
				accept="image/*"
				multiple
				hidden
				onChange={(e) => {
					slots.add([...(e.target.files ?? [])]);
					// The same file picked again must fire a change.
					e.target.value = "";
				}}
			/>
			{atLimit ? (
				<p role="alert" className={ALERT}>
					{PICTURE_TEXT.limit}
				</p>
			) : null}
			{slots.note ? (
				<p role="alert" className={ALERT}>
					{PICTURE_TEXT[slots.note]}
				</p>
			) : null}
		</div>
	);
}
