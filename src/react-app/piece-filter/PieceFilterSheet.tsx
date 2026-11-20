import { cn } from "cn";
import { Check, ChevronRight } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CHIP } from "@/components/ui/chip";
import { FilterSheet } from "@/components/ui/filter";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { LABEL, LIST_ROW, ROW } from "@/components/ui/sheet-form";
import {
	LAYER_GROUP_NAMES,
	LAYER_OF,
	LAYERS,
	type Layer,
	TYPE_IDS,
	TYPE_NAMES,
	type TypeId,
} from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import type { BrandId } from "@/labels/brand";
import { useBrands } from "@/labels/brand-api";
import { ColourSwatches } from "@/labels/ColourSwatches";
import { NO_FILTER, type PieceFilter } from "./piece-filter";

// The Filter sheet: Type, Colour, and Brand, each with many picks. Every
// pick changes the wall at once; there is no Apply.
export function PieceFilterSheet({
	filter,
	onChange,
	shownText,
	onClose,
}: {
	filter: PieceFilter;
	onChange: (filter: PieceFilter) => void;
	shownText: string;
	onClose: () => void;
}) {
	const [typesOpen, setTypesOpen] = useState(false);
	const brands = useBrands();
	const typeValues = [
		...filter.layers.map((l) => `layer:${l}`),
		...filter.types.map((t) => `type:${t}`),
	];
	const toggleType = (type: TypeId) =>
		onChange({
			...filter,
			types: filter.types.includes(type)
				? filter.types.filter((t) => t !== type)
				: TYPE_IDS.filter((t) => t === type || filter.types.includes(t)),
		});
	return (
		<FilterSheet
			step={typesOpen ? "Pick a type" : null}
			onBack={() => setTypesOpen(false)}
			shown={shownText}
			onClearAll={() => onChange(NO_FILTER)}
			onClose={onClose}
		>
			<div
				hidden={typesOpen}
				className="flex flex-col gap-4 [&[hidden]]:hidden"
			>
				<div className="flex flex-col gap-2">
					<span className={LABEL}>Type</span>
					<ToggleGroup.Root
						type="multiple"
						aria-label="Type"
						value={typeValues}
						onValueChange={(values) =>
							onChange({
								...filter,
								layers: LAYERS.filter((l) => values.includes(`layer:${l}`)),
								types: TYPE_IDS.filter((t) => values.includes(`type:${t}`)),
							})
						}
						className="flex flex-wrap gap-[7px]"
					>
						{LAYERS.map((layer: Layer) => (
							<ToggleGroup.Item
								key={layer}
								value={`layer:${layer}`}
								className={CHIP}
							>
								{LAYER_GROUP_NAMES[layer]}
							</ToggleGroup.Item>
						))}
						{filter.types.map((type) => (
							<ToggleGroup.Item
								key={type}
								value={`type:${type}`}
								className={CHIP}
							>
								{TYPE_NAMES[type]}
							</ToggleGroup.Item>
						))}
					</ToggleGroup.Root>
					<button
						type="button"
						className={ROW}
						onClick={() => setTypesOpen(true)}
					>
						<span className="flex-1 text-muted-foreground">Pick a type</span>
						<ChevronRight size={16} strokeWidth={1.9} aria-hidden />
					</button>
				</div>
				<div className="flex flex-col gap-2">
					<span className={LABEL}>Colour</span>
					<ColourSwatches
						values={filter.colours}
						onValuesChange={(colours) => onChange({ ...filter, colours })}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<span className={LABEL}>Brand</span>
					<BrandChips
						brands={brands}
						picks={filter.brands}
						onPicksChange={(picks) => onChange({ ...filter, brands: picks })}
					/>
				</div>
			</div>
			{typesOpen ? (
				<div className="flex flex-col gap-3">
					{LAYERS.map((layer) => (
						<div key={layer} className="flex flex-col">
							<span className={LABEL}>{LAYER_GROUP_NAMES[layer]}</span>
							{TYPE_IDS.filter((id) => LAYER_OF[id] === layer).map((type) => {
								const on = filter.types.includes(type);
								return (
									<button
										key={type}
										type="button"
										aria-pressed={on}
										className={LIST_ROW}
										onClick={() => toggleType(type)}
									>
										<TypeFigure typeId={type} className="size-11 flex-none" />
										<span className="flex-1">{TYPE_NAMES[type]}</span>
										{on ? (
											<Check size={18} strokeWidth={1.9} aria-hidden />
										) : null}
									</button>
								);
							})}
						</div>
					))}
				</div>
			) : null}
		</FilterSheet>
	);
}

// The account's brands as chips, with "No brand" last; grey chips while
// they load and a Retry when they could not, so a failed load never looks
// like an account with no brands.
function BrandChips({
	brands,
	picks,
	onPicksChange,
}: {
	brands: ReturnType<typeof useBrands>;
	picks: (BrandId | null)[];
	onPicksChange: (picks: (BrandId | null)[]) => void;
}) {
	if (brands.isPending)
		return (
			<div className="flex flex-wrap gap-[7px]">
				{Array.from({ length: 3 }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the chips are all alike and never move.
						key={i}
						data-slot="brand-skeleton"
						className={cn("h-8 w-20 rounded-full", PLACEHOLDER)}
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
		<ToggleGroup.Root
			type="multiple"
			aria-label="Brand"
			value={picks.map((b) => b ?? "none")}
			onValueChange={(values) =>
				onPicksChange(values.map((v) => (v === "none" ? null : (v as BrandId))))
			}
			className="flex flex-wrap gap-[7px]"
		>
			{brands.data.map((brand) => (
				<ToggleGroup.Item key={brand.id} value={brand.id} className={CHIP}>
					{brand.name}
				</ToggleGroup.Item>
			))}
			<ToggleGroup.Item value="none" className={CHIP}>
				No brand
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	);
}
