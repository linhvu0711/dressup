import { cn } from "cn";
import type { ReactNode } from "react";

// The wall stays light in both themes, so it takes the light tokens
// (index.css) and the controls on it keep light colours.
export function Stage({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			data-surface="wall"
			className={cn(
				"relative flex items-start justify-center overflow-hidden text-foreground [background:var(--wall)] [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-none [&>svg]:flex-none [&>svg]:overflow-visible",
				className,
			)}
		>
			{children}
		</div>
	);
}
