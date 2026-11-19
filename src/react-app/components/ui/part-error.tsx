import { type ReactNode, useId } from "react";
import { Button } from "./button";

// A part of the piece page whose list failed while another list holds the
// piece.
export function PartError({
	title,
	onRetry,
	children,
}: {
	title: string;
	onRetry: () => void;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section aria-labelledby={id} className="flex flex-col items-start gap-2">
			<h2 id={id} className="text-[22px]">
				{title}
			</h2>
			<p role="alert" className="text-[13px] text-destructive">
				{children}
			</p>
			<Button onClick={onRetry}>Retry</Button>
		</section>
	);
}
