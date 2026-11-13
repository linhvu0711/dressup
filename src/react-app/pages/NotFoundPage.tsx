import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
			<h1 className="text-[28px]">Page not found</h1>
			<p className="max-w-[30ch] text-muted-foreground">
				There is no page at this address.
			</p>
			<Button asChild className="mt-2">
				<Link to="/">Go to Dress</Link>
			</Button>
		</div>
	);
}
