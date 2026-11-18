import type { ReactNode } from "react";

export function Notice({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
			<h2 className="text-[28px]">{title}</h2>
			{children}
		</div>
	);
}
