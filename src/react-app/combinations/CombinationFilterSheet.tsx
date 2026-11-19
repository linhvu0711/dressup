import { cn } from "cn";
import { ChevronDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { TypeButton, TypeOptions } from "@/closet/TypeOptions";
import { Button } from "@/components/ui/button";
import { CHIP, CHIP_DASHED } from "@/components/ui/chip";
import { FilterSheet } from "@/components/ui/filter";
import { LABEL, LIST_ROW, ROW } from "@/components/ui/sheet-form";
import { useColours } from "@/labels/api";
import { ColourSwatches } from "@/labels/ColourSwatches";
import { useTags } from "@/tags/api";
import { TagChips } from "@/tags/TagChips";
import {
	BLANK_ROW,
	type CombinationFilter,
	isBlank,
	NO_FILTER,
	type PieceRow,
} from "./filter";

type Step = { kind: "type" | "colour"; row: number };

const STEP_TITLE = { type: "Type", colour: "Colour" } as const;

// The Filter sheet of the Combinations page. It keeps its own rows while it
// is open, so a row with nothing picked yet stays on screen; only the rows
// with a pick reach the filter.
export function CombinationFilterSheet({
	filter,
	onChange,
	shown,
	onClose,
}: {
	filter: CombinationFilter;
	onChange: (next: CombinationFilter) => void;
	shown: string;
	onClose: () => void;
}) {
	const [rows, setRows] = useState<PieceRow[]>(() =>
		filter.pieces.length > 0 ? filter.pieces : [BLANK_ROW],
	);
	const [step, setStep] = useState<Step | null>(null);
	const colours = useColours();
	const tags = useTags();
	function changeRows(next: PieceRow[]) {
		setRows(next);
		onChange({ ...filter, pieces: next.filter((r) => !isBlank(r)) });
	}
	function setRow(i: number, row: PieceRow) {
		changeRows(rows.map((r, j) => (j === i ? row : r)));
		setStep(null);
	}
	function removeRow(i: number) {
		const next = rows.filter((_, j) => j !== i);
		changeRows(next.length > 0 ? next : [BLANK_ROW]);
	}
	const colourOf = (row: PieceRow) =>
		colours.data?.find((c) => c.id === row.colourId);
	return (
		<FilterSheet
			step={step ? STEP_TITLE[step.kind] : null}
			onBack={() => setStep(null)}
			shown={shown}
			onClearAll={() => {
				setRows([BLANK_ROW]);
				onChange(NO_FILTER);
			}}
			onClose={onClose}
		>
			<div
				hidden={step !== null}
				className="flex flex-col gap-4 [&[hidden]]:hidden"
			>
				<div className="flex flex-col gap-2">
					<span className={LABEL}>Pieces</span>
					{rows.map((row, i) => {
						const colour = colourOf(row);
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: a row holds no state of its own; the sheet's rows are its state.
								key={i}
								data-slot="piece-row"
								className="flex items-start gap-2"
							>
								<div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[16px] border border-border p-2">
									<TypeButton
										typeId={row.typeId}
										empty="Any type"
										onOpen={() => setStep({ kind: "type", row: i })}
									/>
									<button
										type="button"
										className={ROW}
										onClick={() => setStep({ kind: "colour", row: i })}
									>
										<span className="flex min-w-0 flex-1 items-center gap-2 truncate">
											{colour ? (
												<>
													<span
														style={{ background: colour.hex }}
														className="size-[18px] flex-none rounded-full [box-shadow:inset_0_0_0_1px_rgba(110,106,98,.38)]"
													/>
													{colour.name}
												</>
											) : (
												<span className="text-muted-foreground">
													Any colour
												</span>
											)}
										</span>
										<ChevronDown size={16} strokeWidth={1.9} aria-hidden />
									</button>
								</div>
								<Button
									variant="icon"
									size="icon"
									aria-label="Remove piece"
									title="Remove piece"
									className="mt-[14px]"
									onClick={() => removeRow(i)}
								>
									<X size={18} strokeWidth={1.9} aria-hidden />
								</Button>
							</div>
						);
					})}
					<button
						type="button"
						aria-label="+ Another piece"
						className={cn(CHIP, CHIP_DASHED, "self-start")}
						onClick={() => setRows([...rows, BLANK_ROW])}
					>
						<Plus size={14} strokeWidth={1.9} aria-hidden />
						Another piece
					</button>
				</div>
				{tags.data?.length ? (
					<div className="flex flex-col gap-2">
						<span className={LABEL}>Tags</span>
						<TagChips
							tags={tags.data}
							picked={filter.tags}
							onChange={(picked) => onChange({ ...filter, tags: picked })}
						/>
					</div>
				) : null}
			</div>
			{step?.kind === "type" ? (
				<TypeOptions
					onPick={(typeId) => setRow(step.row, { ...rows[step.row], typeId })}
					onAny={() => setRow(step.row, { ...rows[step.row], typeId: null })}
				/>
			) : null}
			{step?.kind === "colour" ? (
				<div className="flex flex-col gap-3">
					<button
						type="button"
						className={LIST_ROW}
						onClick={() =>
							setRow(step.row, { ...rows[step.row], colourId: null })
						}
					>
						Any colour
					</button>
					<ColourSwatches
						value={rows[step.row].colourId ?? undefined}
						onChange={(colourId) =>
							setRow(step.row, { ...rows[step.row], colourId })
						}
					/>
				</div>
			) : null}
		</FilterSheet>
	);
}
