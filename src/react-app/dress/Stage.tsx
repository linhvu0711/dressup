import { cn } from "cn";
import type { ReactNode } from "react";

// The wall stays light in both themes, so it takes the light tokens
// (index.css) and the controls on it keep light colours.
export function Stage({
	className,
	children,
	corner,
	action,
}: {
	className?: string;
	children: ReactNode;
	corner?: ReactNode;
	action?: ReactNode;
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
			{corner ? (
				<div className="absolute top-3 left-3 flex max-w-[calc(100%-80px)] items-center gap-2">
					{corner}
				</div>
			) : null}
			{action ? <div className="absolute top-3 right-3">{action}</div> : null}
		</div>
	);
}
