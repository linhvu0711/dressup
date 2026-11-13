import { cn } from "cn";
import type { ReactNode } from "react";
import { SettingsLink } from "@/shell/SettingsLink";

// The wall stays light in both themes, so it takes the light tokens
// (index.css) and the controls on it keep light colours.
export function Stage({
	className,
	children,
	action,
}: {
	className?: string;
	children: ReactNode;
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
			<div className="absolute top-3 left-3 flex items-center gap-2">
				<SettingsLink className="wide:hidden border-transparent bg-card shadow-lift" />
			</div>
			{action ? <div className="absolute top-3 right-3">{action}</div> : null}
		</div>
	);
}
