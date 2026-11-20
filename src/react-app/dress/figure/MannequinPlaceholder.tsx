import { PULSE } from "@/components/ui/placeholder";
// The grey figure the stage shows while the account's colours load, pulsing.
// Not loading, it is still and hidden from screen readers: a wall card far
// from the screen shows it in place of its mannequin.
export function MannequinPlaceholder({
	viewBox = "0 10 400 800",
	loading = true,
}: {
	viewBox?: string;
	loading?: boolean;
}) {
	return (
		<svg
			viewBox={viewBox}
			role={loading ? "img" : undefined}
			aria-label={loading ? "Loading" : undefined}
			aria-hidden={loading ? undefined : true}
			className={loading ? PULSE : undefined}
		>
			<g fill="#000" opacity=".16">
				<ellipse cx="200" cy="95" rx="40" ry="50" />
				<path d="M128 178 Q200 150 272 178 L290 420 L262 424 L254 262 L248 760 L206 760 L200 470 L194 760 L152 760 L146 262 L138 424 L110 420 Z" />
			</g>
		</svg>
	);
}
