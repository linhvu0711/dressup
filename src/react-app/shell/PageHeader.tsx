import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { pageBeforeSettings, SettingsLink } from "./SettingsLink";

export function PageHeader({
	title,
	back = false,
}: {
	title: string;
	back?: boolean;
}) {
	const location = useLocation();
	return (
		<div className="flex min-h-[62px] flex-none items-center gap-3 px-4 pt-[14px] pb-2 text-[28px] leading-[1.1] wide:px-6 wide:pt-[18px]">
			{back ? (
				<Button asChild variant="icon" size="icon">
					<Link
						to={pageBeforeSettings(location.state)}
						aria-label="Back"
						title="Back"
					>
						<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
					</Link>
				</Button>
			) : (
				<SettingsLink className="wide:hidden" />
			)}
			<h1>{title}</h1>
		</div>
	);
}
