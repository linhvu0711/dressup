import type { ReactNode } from "react";
import { Link } from "react-router";

const SUPPORT_EMAIL = "linh.tuan.vu.contact@gmail.com";
const LAST_CHANGED = "18 November 2026";

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={id}>
			<h2 id={id} className="mt-8 text-[20px] leading-[1.15]">
				{title}
			</h2>
			{children}
		</section>
	);
}

function EmailLink() {
	return (
		<a
			href={`mailto:${SUPPORT_EMAIL}`}
			className="underline underline-offset-2"
		>
			{SUPPORT_EMAIL}
		</a>
	);
}

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
				<p className="mt-2 text-[13px] text-muted-foreground">
					Last changed: {LAST_CHANGED}
				</p>
				<p className="mt-6">
					This page says what dressup keeps about you, why it keeps it, where it
					is kept, and how to get it deleted.
				</p>

				<Section id="privacy-keeps" title="What dressup keeps">
					<p className="mt-2">When you sign in with Google, dressup keeps:</p>
					<ul className="mt-2 list-disc space-y-1 pl-5">
						<li>Your Google account's name, email, and picture.</li>
						<li>The colours you save.</li>
						<li>The brands you save.</li>
						<li>Your last outfit.</li>
						<li>Your looks and their tags.</li>
						<li>Your combinations.</li>
						<li>Your closet.</li>
						<li>The pictures you add to your closet.</li>
						<li>Your mannequin's skin and hair colour.</li>
					</ul>
				</Section>

				<Section id="privacy-why" title="Why">
					<p className="mt-2">
						dressup keeps this only to show you your own clothes and looks.
						Nothing is sold, shared, or used for ads.
					</p>
				</Section>

				<Section id="privacy-where" title="Where it lives">
					<p className="mt-2">Cloudflare runs the app and keeps the data.</p>
					<p className="mt-2">Google is used only for sign-in.</p>
					<p className="mt-2">
						dressup sets only the cookies that keep you signed in. It sets no
						tracking cookies.
					</p>
				</Section>

				<Section id="privacy-delete" title="How to delete it">
					<p className="mt-2">
						In Settings, "Delete my account" deletes your account and all its
						data at once, your pictures too.
					</p>
				</Section>

				<Section id="privacy-contact" title="Contact">
					<p className="mt-2">
						Questions about this page or your data: <EmailLink />.
					</p>
				</Section>
			</article>
		</main>
	);
}
