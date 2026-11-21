import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { SettingsLink } from "./SettingsLink";

export function BackLink({ to }: { to: string }) {
	return (
		<Button asChild variant="icon" size="icon">
			<Link to={to} aria-label="Back" title="Back">
				<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
			</Link>
		</Button>
	);
}

export function PageHeader({
	title,
	start = <SettingsLink className="wide:hidden" />,
	end,
}: {
	title?: string;
	start?: ReactNode;
	end?: ReactNode;
}) {
	return (
		<div className="flex min-h-[62px] flex-none items-center gap-3 px-4 pt-[14px] pb-2 text-[28px] leading-[1.1] wide:px-6 wide:pt-[18px]">
			{start}
			{title === undefined ? null : <h1>{title}</h1>}
			{end ? (
				<>
					<span className="flex-1" />
					{end}
				</>
			) : null}
		</div>
	);
}
