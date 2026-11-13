import { Button } from "@/components/ui/button";

// The prototype's own sign-in mark (docs/prototype/dressup.html:785); Lucide has none.
function GoogleMark() {
	return (
		<svg
			width={18}
			height={18}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.9}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M21 12h-9" />
			<path d="M21 12a9 9 0 1 1-2.64-6.36" />
		</svg>
	);
}

export function SignInPage() {
	return (
		<div className="flex h-dvh flex-col bg-background">
			<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
				<h1 className="text-[76px] leading-none tracking-[-0.02em]">dressup</h1>
				<p className="max-w-[32ch] text-balance text-[15px] text-muted-foreground">
					See your clothes in your colours, before you put them on.
				</p>
				<Button variant="primary" size="lg" className="mt-4">
					<GoogleMark />
					Sign in with Google
				</Button>
			</div>
		</div>
	);
}
