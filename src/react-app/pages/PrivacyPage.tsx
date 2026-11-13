import { Link } from "react-router";

export function PrivacyPage() {
	return (
		<main className="min-h-dvh bg-background text-foreground">
			<article className="mx-auto max-w-[640px] px-4 pt-[14px] pb-12 wide:px-6 wide:pt-[18px]">
				<Link
					to="/"
					className="font-serif text-[27px] leading-none tracking-[-0.01em]"
				>
					dressup
				</Link>
				<h1 className="mt-6 text-[28px] leading-[1.1]">Privacy</h1>
			</article>
		</main>
	);
}
