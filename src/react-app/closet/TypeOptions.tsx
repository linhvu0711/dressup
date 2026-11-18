import { ChevronRight } from "lucide-react";
import type { Ref } from "react";
import { Field, LIST_ROW, ROW } from "@/components/ui/sheet-form";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { GARMENT_IDS, GARMENT_NAMES, type GarmentId } from "@/dress/garments";

// The Type row of a form: the picked type's figure and name, or "Pick a
// type". It opens the type list.
export function TypeField({
	typeId,
	onOpen,
	ref,
}: {
	typeId: GarmentId | null;
	onOpen: () => void;
	ref?: Ref<HTMLButtonElement>;
}) {
	return (
		<Field label="Type">
			<button ref={ref} type="button" className={ROW} onClick={onOpen}>
				<span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
					{typeId ? (
						<>
							<TypeFigure typeId={typeId} />
							{GARMENT_NAMES[typeId]}
						</>
					) : (
						<span className="text-muted-foreground">Pick a type</span>
					)}
				</span>
				<ChevronRight size={16} strokeWidth={1.9} aria-hidden />
			</button>
		</Field>
	);
}

// The 17 types, each with its figure, as the type step of a form.
export function TypeOptions({
	onPick,
}: {
	onPick: (typeId: GarmentId) => void;
}) {
	return (
		<div className="flex flex-col">
			{GARMENT_IDS.map((option) => (
				<button
					key={option}
					type="button"
					data-slot="type-option"
					className={LIST_ROW}
					onClick={() => onPick(option)}
				>
					<TypeFigure typeId={option} className="size-11 flex-none" />
					{GARMENT_NAMES[option]}
				</button>
			))}
		</div>
	);
}
