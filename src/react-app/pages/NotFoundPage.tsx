import { Link } from "react-router";

export function NotFoundPage() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
			<h1 className="text-[28px]">Page not found</h1>
			<p className="max-w-[30ch] text-muted-foreground">
				There is no page at this address.
			</p>
			<Link to="/">Go to Dress</Link>
		</div>
	);
}
