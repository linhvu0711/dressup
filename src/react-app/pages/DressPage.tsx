import { Mannequin } from "@/dress/figure/Mannequin";
import { Stage } from "@/dress/Stage";

export function DressPage() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<h1 className="sr-only">Dress</h1>
			<Stage className="flex-[0_0_46%] rounded-b-[24px] wide:flex-1 wide:rounded-none">
				<Mannequin />
			</Stage>
		</div>
	);
}
