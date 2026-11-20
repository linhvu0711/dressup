import { ChevronRight } from "lucide-react";
import { type Ref, useState } from "react";
import type { Panel, PanelStepView } from "@/components/ui/panel-sheet";
import { Field, ROW } from "@/components/ui/sheet-form";
import { BrandOptions } from "./BrandOptions";
import type { Brand, BrandId } from "./brand";
import { useBrands } from "./brand-api";

export type BrandPick = {
	brandId: BrandId | null;
	name: string | undefined;
	open: () => void;
	// The Pick a brand step, for the panel's "brands" step.
	step: PanelStepView;
};

// The brand of a record in its panel: the pick, its name, and the Pick a
// brand step. `own` is the record's brand, which names the row while the
// brand list loads.
export function useBrandPick<Id extends string>(
	panel: Panel<Id>,
	own: Brand | null,
): BrandPick {
	const [brandId, setBrandId] = useState<BrandId | null>(own?.id ?? null);
	const brands = useBrands();
	const name =
		brands.data?.find((b) => b.id === brandId)?.name ??
		(brandId !== null && brandId === own?.id ? own.name : undefined);
	return {
		brandId,
		name,
		open: () => panel.open("brands"),
		step: {
			title: "Pick a brand",
			body: <BrandOptions brands={brands} onPick={panel.pick(setBrandId)} />,
		},
	};
}

// The brand row of a panel; it opens the Pick a brand step.
export function BrandField({
	pick,
	ref,
	"aria-label": label,
}: {
	pick: BrandPick;
	ref?: Ref<HTMLButtonElement>;
	"aria-label"?: string;
}) {
	return (
		<Field label="Brand">
			<button
				ref={ref}
				type="button"
				aria-label={label}
				className={ROW}
				onClick={pick.open}
			>
				<span className="min-w-0 flex-1 truncate">
					{pick.name ?? "No brand"}
				</span>
				<ChevronRight size={16} strokeWidth={1.9} aria-hidden />
			</button>
		</Field>
	);
}
