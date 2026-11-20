import { cn } from "cn";
import { SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CHIP, CHIP_DASHED } from "@/components/ui/chip";
import { FormSheet } from "@/components/ui/sheet-form";

// The parts of a filter that hold no words of what they filter, so each
// page with a filter draws them alike.

export function FilterButton({
	count,
	onClick,
}: {
	count: number;
	onClick: () => void;
}) {
	return (
		<Button
			variant="icon"
			size="icon"
			aria-label="Filter"
			title="Filter"
			className="relative"
			onClick={onClick}
		>
			<SlidersHorizontal size={18} strokeWidth={1.9} aria-hidden />
			{count > 0 ? (
				<span
					data-slot="filter-count"
					aria-hidden
					className="-top-[7px] -right-[7px] absolute flex size-[18px] items-center justify-center rounded-full bg-foreground font-semibold text-[11px] text-background"
				>
					{count}
				</span>
			) : null}
		</Button>
	);
}

// The Filter sheet. A pick changes the page at once; Show only closes it.
// A list swaps into the same sheet as a step, with Back.
export function FilterSheet({
	step,
	onBack,
	shown,
	onClearAll,
	onClose,
	children,
}: {
	step: string | null;
	onBack: () => void;
	shown: string;
	onClearAll: () => void;
	onClose: () => void;
	children: ReactNode;
}) {
	const showRef = useRef<HTMLButtonElement>(null);
	return (
		<FormSheet
			title="Filter"
			step={step}
			onBack={onBack}
			focus={showRef}
			onClose={onClose}
		>
			{children}
			{step === null ? (
				<div className="flex gap-2.5">
					<Button className="flex-1" onClick={onClearAll}>
						Clear all
					</Button>
					<Button
						ref={showRef}
						variant="primary"
						className="flex-1"
						onClick={onClose}
					>
						Show {shown}
					</Button>
				</div>
			) : null}
		</FormSheet>
	);
}

export type ActiveFilter = {
	key: string;
	label: string;
	icon?: ReactNode;
	onRemove: () => void;
};

export const shownText = (n: number, one: string) =>
	n === 1 ? `1 ${one}` : `${n} ${one}s`;

// The filters that are on, one chip each with a cross, and Clear all last;
// under them, how many items show.
export function ActiveFilters({
	chips,
	onClearAll,
	shown,
}: {
	chips: ActiveFilter[];
	onClearAll: () => void;
	shown: string;
}) {
	if (chips.length === 0) return null;
	return (
		<>
			<fieldset
				aria-label="Active filters"
				className="flex min-w-0 flex-none gap-[7px] overflow-x-auto px-4 pt-0.5 pb-1.5 [scrollbar-width:none] wide:px-6"
			>
				{chips.map((chip) => (
					<span
						key={chip.key}
						data-slot="filter-chip"
						className={cn(
							CHIP,
							"border-primary bg-primary pr-1 text-primary-foreground hover:bg-primary",
						)}
					>
						{chip.icon}
						{chip.label}
						<button
							type="button"
							aria-label={`Remove ${chip.label}`}
							title={`Remove ${chip.label}`}
							className="grid size-6 place-items-center rounded-full hover:bg-white/15"
							onClick={chip.onRemove}
						>
							<X size={14} strokeWidth={1.9} aria-hidden />
						</button>
					</span>
				))}
				<button
					type="button"
					className={cn(CHIP, CHIP_DASHED)}
					onClick={onClearAll}
				>
					Clear all
				</button>
			</fieldset>
			<p
				data-slot="filter-shown"
				className="px-4 pb-2 text-[12.5px] text-muted-foreground wide:px-6"
			>
				{shown}
			</p>
		</>
	);
}
