import { Button } from "@/components/ui/button";

// In place of the mannequin when its colours did not load.
export function MannequinFailed({ onLoadAgain }: { onLoadAgain: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 text-center">
			<p role="alert" className="text-[15px] text-destructive">
				Could not load your mannequin.
			</p>
			<Button size="lg" className="mt-4" onClick={onLoadAgain}>
				Try again
			</Button>
		</div>
	);
}
