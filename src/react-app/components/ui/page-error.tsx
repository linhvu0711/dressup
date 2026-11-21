import { Button } from "./button";
import { Notice } from "./notice";

// In place of a whole page whose list did not load.
export function PageError({
	title,
	onRetry,
}: {
	title: string;
	onRetry: () => void;
}) {
	return (
		<Notice title={title}>
			<Button className="mt-2" onClick={onRetry}>
				Retry
			</Button>
		</Notice>
	);
}
