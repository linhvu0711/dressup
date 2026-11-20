import { type ReactNode, useId } from "react";
import { Button } from "./button";

// A part of a page or a sheet whose list failed while the rest still works.
// A part that sits under a field name already has its title.
export function PartError({
	title,
	onRetry,
	children,
}: {
	title?: string;
	onRetry: () => void;
	children: ReactNode;
}) {
	const id = useId();
	const body = (
		<>
			<p role="alert" className="text-[13px] text-destructive">
				{children}
			</p>
			<Button onClick={onRetry}>Retry</Button>
		</>
	);
	return title === undefined ? (
		<div className="flex flex-col items-start gap-2">{body}</div>
	) : (
		<section aria-labelledby={id} className="flex flex-col items-start gap-2">
			<h2 id={id} className="text-[22px]">
				{title}
			</h2>
			{body}
		</section>
	);
}
