import { Button } from "@/components/ui/button";
import { LIST_ROW } from "@/components/ui/sheet-form";
import type { BrandId } from "./brand";
import type { useBrands } from "./brand-api";

// The account's brands with "No brand" first, as the brand step of a form,
// with its own loading rows and failed line. It takes the form's brand
// query: a query of its own would load again as the step opens, and a
// failed load would never show.
export function BrandOptions({
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
