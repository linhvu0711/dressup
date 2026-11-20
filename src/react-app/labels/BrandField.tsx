import { ChevronRight } from "lucide-react";
import { type Ref, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Panel, PanelStepView } from "@/components/ui/panel-sheet";
import { Field, LIST_ROW, ROW } from "@/components/ui/sheet-form";
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

// The account's brands with "No brand" first, as the brand step of a form,
// with its own loading rows and failed line. It takes the form's brand
// query: a query of its own would load again as the step opens, and a
// failed load would never show.
function BrandOptions({
	brands,
	onPick,
}: {
	brands: ReturnType<typeof useBrands>;
	onPick: (brandId: BrandId | null) => void;
}) {
	if (brands.isPending)
		return (
			<div className="flex flex-col gap-2">
				{Array.from({ length: 3 }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the rows are all alike and never move.
						key={i}
						data-slot="brand-skeleton"
						className="h-11 rounded-[12px] bg-muted animate-placeholder motion-reduce:animate-none"
					/>
				))}
			</div>
		);
	if (brands.isError)
		return (
			<div className="flex items-center gap-3">
				<p role="alert" className="text-[13px] text-destructive">
					Could not load your brands
				</p>
				<Button onClick={() => void brands.refetch()}>Retry</Button>
			</div>
		);
	return (
		<div className="flex flex-col">
			{[{ id: null, name: "No brand" }, ...brands.data].map((option) => (
				<button
					key={option.id ?? "none"}
					type="button"
					className={LIST_ROW}
					onClick={() => onPick(option.id)}
				>
					{option.name}
				</button>
			))}
		</div>
	);
}
