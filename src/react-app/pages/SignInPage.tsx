import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "../auth-client";

// The Google mark, drawn here since Lucide has none.
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

function signInWithGoogle() {
	// Better Auth sends errors and cancels back to "/" with ?error=.
	return authClient.signIn.social({
		provider: "google",
		callbackURL: "/",
		errorCallbackURL: "/",
	});
}

export function SignInPage() {
	const [params] = useSearchParams();
	// Better Auth sends a new Google account here while SIGNUPS_CLOSED is true.
	const closed = params.get("error") === "signup_disabled";
	return (
		<div className="flex h-dvh flex-col bg-background">
			<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
				<h1 className="text-[76px] leading-none tracking-[-0.02em]">dressup</h1>
				{closed ? (
					<h2 className="text-[28px] leading-tight">No new accounts for now</h2>
				) : null}
				<p className="max-w-[32ch] text-balance text-[15px] text-muted-foreground">
					{closed
						? "The app is full at the moment. If you have an account, you can sign in."
						: "See your clothes in your colours, before you put them on."}
				</p>
				<Button
					variant="primary"
					size="lg"
					className="mt-4"
					onClick={signInWithGoogle}
				>
					<GoogleMark />
					Sign in with Google
				</Button>
				{params.has("error") && !closed && (
					<p role="alert" className="text-[13px] text-destructive">
						Sign-in did not work. Try again.
					</p>
				)}
			</div>
		</div>
	);
}
