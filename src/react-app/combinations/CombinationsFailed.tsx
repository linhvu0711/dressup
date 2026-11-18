import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

// In place of the wall, or of the builder at /build/<id>, when the
// combinations did not load.
export function CombinationsFailed({ onRetry }: { onRetry: () => void }) {
	return (
		<Notice title="Could not load your combinations">
			<Button className="mt-2" onClick={onRetry}>
				Retry
			</Button>
		</Notice>
	);
}
