import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "../auth-client";
import { useMe } from "../session";
import { SignInPage } from "./SignInPage";

type AiApp = { client_id: string; client_name?: string; logo_uri?: string };

const PLACEHOLDER = "animate-placeholder bg-muted motion-reduce:animate-none";

const DressupIcon = () => (
	<img
		src="/icon-512.png"
		alt="dressup"
		width={56}
		height={56}
		className="rounded-[23%]"
	/>
);

// A missing or broken logo shows the first letter of the app's name.
function AppLogo({ name, logo }: { name: string; logo?: string }) {
	const [broken, setBroken] = useState(false);
	if (logo && !broken)
		return (
			<img
				src={logo}
				alt={name}
				width={56}
				height={56}
				className="rounded-[12px]"
				onError={() => setBroken(true)}
			/>
		);
	return (
		<div
			role="img"
			aria-label={name}
			className="grid size-14 place-items-center rounded-[12px] border border-border bg-muted font-serif text-[32px]"
		>
			{name.charAt(0).toUpperCase()}
		</div>
	);
}

function AllowScreen() {
	const [params] = useSearchParams();
	const clientId = params.get("client_id") ?? "";
	const app = useQuery({
		queryKey: ["allow-app", clientId],
		queryFn: async () => {
			const { data, error } = await authClient.$fetch<AiApp>(
				"/oauth2/public-client",
				{ method: "GET", query: { client_id: clientId } },
			);
			if (error) throw new Error(`public-client answered ${error.status}`);
			return data;
		},
		// "Try again" on the page is the person's way to try again; three silent
		// retries would hold the placeholders for about 7 s first.
		retry: false,
	});
	// The answer is { redirect: true, url }, and the auth client's redirect
	// plugin sends the browser to the app itself; a second navigation here would
	// abort the first.
	const answer = useMutation({
		mutationFn: async (accept: boolean) => {
			const { data, error } = await authClient.$fetch<{ url: string }>(
				"/oauth2/consent",
				{ method: "POST", body: { accept } },
			);
			if (error) throw new Error(`consent answered ${error.status}`);
			return data;
		},
	});

	if (app.isError)
		return (
			<>
				<DressupIcon />
				<p role="alert" className="text-[15px] text-destructive">
					Could not load this app. Try again.
				</p>
				<Button size="lg" className="mt-4" onClick={() => app.refetch()}>
					Try again
				</Button>
			</>
		);

	const name = app.data?.client_name ?? app.data?.client_id ?? "";
	const busy = !app.data || answer.isPending || answer.isSuccess;
	return (
		<>
			<div className="mb-2 flex items-center gap-[14px]">
				<DressupIcon />
				<ArrowLeftRight
					size={20}
					strokeWidth={1.9}
					className="text-muted-foreground"
					aria-hidden
				/>
				{app.data ? (
					<AppLogo name={name} logo={app.data.logo_uri} />
				) : (
					<div className={`size-14 rounded-[12px] ${PLACEHOLDER}`} />
				)}
			</div>
			{app.data ? (
				<p className="max-w-[32ch] text-balance text-[15px] text-muted-foreground">
					<b className="font-medium text-foreground">{name}</b> wants to see and
					change your outfit, colours, looks, and tags.
				</p>
			) : (
				<div className="flex flex-col items-center gap-2">
					<div className={`h-4 w-[26ch] rounded ${PLACEHOLDER}`} />
					<div className={`h-4 w-[18ch] rounded ${PLACEHOLDER}`} />
				</div>
			)}
			<div className="mt-4 flex gap-[10px]">
				<Button size="lg" disabled={busy} onClick={() => answer.mutate(false)}>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="lg"
					disabled={busy}
					onClick={() => answer.mutate(true)}
				>
					Allow
				</Button>
			</div>
			{answer.isError ? (
				<p role="alert" className="text-[13px] text-destructive">
					Not allowed. Try again.
				</p>
			) : null}
		</>
	);
}

// Where an AI app sends the person to let it in. Signed out, the sign-in
// screen comes first; the signed query in the address brings Google back here.
export function AllowPage() {
	const me = useMe();
	if (me.isPending) return <div className="h-dvh bg-background" />;
	if (!me.data) return <SignInPage />;
	return (
		<div className="flex h-dvh flex-col bg-background">
			<main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
				<AllowScreen />
			</main>
		</div>
	);
}
