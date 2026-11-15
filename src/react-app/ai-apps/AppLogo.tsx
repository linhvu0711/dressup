import { useState } from "react";

// A missing or broken logo shows the first letter of the app's name.
export function AppLogo({
	name,
	logo,
	size,
}: {
	name: string;
	logo?: string;
	size: number;
}) {
	const [broken, setBroken] = useState(false);
	if (logo && !broken)
		return (
			<img
				src={logo}
				alt={name}
				width={size}
				height={size}
				className="flex-none rounded-[12px]"
				onError={() => setBroken(true)}
			/>
		);
	return (
		<div
			role="img"
			aria-label={name}
			className="grid flex-none place-items-center rounded-[12px] border border-border bg-muted font-serif"
			style={{ width: size, height: size, fontSize: (size * 4) / 7 }}
		>
			{name.charAt(0).toUpperCase()}
		</div>
	);
}
