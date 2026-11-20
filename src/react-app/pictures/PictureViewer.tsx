import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SHEET_OVERLAY } from "@/components/ui/sheet";
import { type PictureId, pictureAddress } from "./picture";

// One picture as large as the screen allows, with previous and next when
// the item has more. Esc or a click outside the picture closes it; it has
// no close button.
export function PictureViewer({
	ids,
	start,
	onClose,
}: {
	ids: readonly PictureId[];
	start: number;
	onClose: () => void;
}) {
	const [at, setAt] = useState(start);
	const total = ids.length;
	return (
		<Dialog.Root open onOpenChange={(open) => open || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className={SHEET_OVERLAY} />
				<Dialog.Content
					aria-describedby={undefined}
					onClick={(e) => {
						if (e.target === e.currentTarget) onClose();
					}}
					className="fixed inset-0 z-[21] flex flex-col items-center justify-center gap-3 p-4 outline-none"
				>
					<Dialog.Title className="sr-only">
						Picture {at + 1} of {total}
					</Dialog.Title>
					<img
						src={pictureAddress(ids[at])}
						alt=""
						className="max-h-[calc(100dvh-8rem)] max-w-full rounded-[14px] bg-muted object-contain"
					/>
					{total > 1 ? (
						<div className="flex items-center gap-3">
							<Button
								size="icon"
								aria-label="Previous picture"
								title="Previous picture"
								disabled={at === 0}
								onClick={() => setAt(at - 1)}
							>
								<ChevronLeft size={18} strokeWidth={1.9} aria-hidden />
							</Button>
							<span className="text-[14px] text-white">
								{at + 1} / {total}
							</span>
							<Button
								size="icon"
								aria-label="Next picture"
								title="Next picture"
								disabled={at === total - 1}
								onClick={() => setAt(at + 1)}
							>
								<ChevronRight size={18} strokeWidth={1.9} aria-hidden />
							</Button>
						</div>
					) : null}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
