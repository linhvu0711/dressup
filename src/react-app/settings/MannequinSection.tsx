import { cn } from "cn";
import { useState } from "react";
import { ColourPicker } from "@/colour/ColourPicker";
import type { Hex } from "@/colour/hex";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { useToast } from "@/components/ui/toast";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { useMannequin, useSetMannequinColour } from "@/mannequin/api";
import { MannequinFailed } from "@/mannequin/MannequinFailed";
import { MANNEQUIN_PARTS, type MannequinPart } from "@/mannequin/mannequin";

const NAMES: Record<MannequinPart, string> = {
	skin: "Skin colour",
	hair: "Hair colour",
};

const PREVIEW_VIEW_BOX = "90 20 220 220";

const SQUARE =
	"size-[34px] flex-none rounded-[10px] shadow-[inset_0_0_0_1px_rgba(110,106,98,.38)] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]";

type Live = { part: MannequinPart; hex: Hex };

// The Mannequin part of the Settings page.
export function MannequinSection() {
	const mannequin = useMannequin();
	const set = useSetMannequinColour();
	const toast = useToast();
	const [open, setOpen] = useState<MannequinPart | null>(null);
	// The colour the picker shows before "Set", and while its save runs. Only
	// the preview shows it; the rows keep the stored colour.
	const [live, setLive] = useState<Live | null>(null);
	const stored = mannequin.data ?? null;
	const shown = stored && live ? { ...stored, [live.part]: live.hex } : stored;

	const close = () => {
		setOpen(null);
		setLive(null);
	};

	return (
		<>
			<h2 className="mt-1.5 mb-1.5 font-sans text-[12.5px] font-medium text-muted-foreground">
				Mannequin
			</h2>
			{mannequin.isError ? (
				<MannequinFailed onLoadAgain={() => mannequin.refetch()} />
			) : (
				<div className="flex items-center gap-[18px]">
					<div
						data-slot="mannequin-preview"
						className="relative size-[104px] flex-none overflow-hidden rounded-[18px] bg-[#D3CFC9] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full"
					>
						{shown ? (
							<Mannequin
								layers={[{ garment: "tee_s", color: "#F3F1EC" }]}
								viewBox={PREVIEW_VIEW_BOX}
								lite
								label="Mannequin preview"
								skin={shown.skin}
								hair={shown.hair}
							/>
						) : (
							<MannequinPlaceholder viewBox={PREVIEW_VIEW_BOX} />
						)}
					</div>
					<div className="min-w-0 flex-1">
						{MANNEQUIN_PARTS.map((part) => (
							<div
								key={part}
								data-part={part}
								className="flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]"
							>
								<button
									type="button"
									disabled={!stored}
									onClick={() => setOpen(part)}
									className="flex w-full items-center gap-3 text-left"
								>
									<span>{NAMES[part]}</span>
									<span className="flex-1" />
									{stored ? (
										<>
											<span
												data-slot="mannequin-code"
												className="font-mono text-[12.5px] text-muted-foreground"
											>
												{stored[part]}
											</span>
											<span
												className={SQUARE}
												style={{ background: stored[part] }}
											/>
										</>
									) : (
										<span className={cn(SQUARE, PLACEHOLDER)} />
									)}
								</button>
							</div>
						))}
					</div>
				</div>
			)}
			{open && stored ? (
				<ColourPicker
					title={NAMES[open]}
					start={stored[open]}
					action="Set"
					onLive={(hex) => setLive({ part: open, hex })}
					onCancel={close}
					onDone={(hex) => {
						const part = open;
						setOpen(null);
						set.mutate(
							{ part, hex },
							{
								onSuccess: () => toast(`${NAMES[part]} set`),
								onError: () => toast("Not set. Try again."),
								// A newer colour typed meanwhile stays in the preview.
								onSettled: () =>
									setLive((now) =>
										now?.part === part && now.hex === hex ? null : now,
									),
							},
						);
					}}
				/>
			) : null}
		</>
	);
}
