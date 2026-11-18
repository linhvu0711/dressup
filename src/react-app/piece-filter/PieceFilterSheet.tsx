import { Check, ChevronRight } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CHIP } from "@/components/ui/chip";
import { FormSheet, LABEL, LIST_ROW, ROW } from "@/components/ui/sheet-form";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	type GarmentId,
	LAYER_GROUP_NAMES,
	LAYER_OF,
	LAYERS,
	type Layer,
} from "@/dress/garments";
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
	const first = useRef<HTMLButtonElement>(null);
	const brands = useBrands();
	const typeValues = [
		...filter.layers.map((l) => `layer:${l}`),
		...filter.types.map((t) => `type:${t}`),
	];
	const toggleType = (type: GarmentId) =>
		onChange({
			...filter,
			types: filter.types.includes(type)
				? filter.types.filter((t) => t !== type)
				: GARMENT_IDS.filter((t) => t === type || filter.types.includes(t)),
		});
	return (
		<FormSheet
			title="Filter"
			step={typesOpen ? "Pick a type" : null}
			onBack={() => setTypesOpen(false)}
			focus={first}
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
								types: GARMENT_IDS.filter((t) => values.includes(`type:${t}`)),
							})
						}
						className="flex flex-wrap gap-[7px]"
					>
						{LAYERS.map((layer: Layer, i) => (
							<ToggleGroup.Item
								key={layer}
								ref={i === 0 ? first : undefined}
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
								{GARMENT_NAMES[type]}
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
					<ToggleGroup.Root
						type="multiple"
						aria-label="Brand"
						value={filter.brands.map((b) => b ?? "none")}
						onValueChange={(values) =>
							onChange({
								...filter,
								brands: values.map((v) =>
									v === "none" ? null : (v as BrandId),
								),
							})
						}
						className="flex flex-wrap gap-[7px]"
					>
						{(brands.data ?? []).map((brand) => (
							<ToggleGroup.Item
								key={brand.id}
								value={brand.id}
								className={CHIP}
							>
								{brand.name}
							</ToggleGroup.Item>
						))}
						<ToggleGroup.Item value="none" className={CHIP}>
							No brand
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div className="mt-0.5 flex gap-2">
					<Button className="flex-1" onClick={() => onChange(NO_FILTER)}>
						Clear all
					</Button>
					<Button variant="primary" className="flex-1" onClick={onClose}>
						Show {shownText}
					</Button>
				</div>
			</div>
			{typesOpen ? (
				<div className="flex flex-col gap-3">
					{LAYERS.map((layer) => (
						<div key={layer} className="flex flex-col">
							<span className={LABEL}>{LAYER_GROUP_NAMES[layer]}</span>
							{GARMENT_IDS.filter((id) => LAYER_OF[id] === layer).map(
								(type) => {
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
											<span className="flex-1">{GARMENT_NAMES[type]}</span>
											{on ? (
												<Check size={18} strokeWidth={1.9} aria-hidden />
											) : null}
										</button>
									);
								},
							)}
						</div>
					))}
				</div>
			) : null}
		</FormSheet>
	);
}
