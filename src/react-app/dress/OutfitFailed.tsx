import { Button } from "@/components/ui/button";

// In place of the mannequin when the first outfit load gave up.
export function OutfitFailed({ onLoadAgain }: { onLoadAgain: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 text-center">
			<p role="alert" className="text-[15px] text-destructive">
				Could not load your outfit.
			</p>
			<Button size="lg" className="mt-4" onClick={onLoadAgain}>
				Try again
			</Button>
		</div>
	);
}
