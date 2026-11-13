// The grey figure the stage shows while the account's colours load, from
// docs/prototype/dressup.html:816.
export function MannequinPlaceholder({
	viewBox = "0 10 400 800",
}: {
	viewBox?: string;
}) {
	return (
		<svg
			viewBox={viewBox}
			role="img"
			aria-label="Loading"
			className="animate-placeholder motion-reduce:animate-none"
		>
			<g fill="#000" opacity=".16">
				<ellipse cx="200" cy="95" rx="40" ry="50" />
				<path d="M128 178 Q200 150 272 178 L290 420 L262 424 L254 262 L248 760 L206 760 L200 470 L194 760 L152 760 L146 262 L138 424 L110 420 Z" />
			</g>
		</svg>
	);
}
