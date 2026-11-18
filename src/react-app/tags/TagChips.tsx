import { ToggleGroup } from "radix-ui";
import { CHIP } from "@/components/ui/chip";
import type { Tag, TagId } from "./tag";

// The account's tags as chips; several can be on.
export function TagChips({
	tags,
	picked,
	onChange,
}: {
	tags: readonly Tag[];
	picked: TagId[];
	onChange: (picked: TagId[]) => void;
}) {
	return (
		<ToggleGroup.Root
			type="multiple"
			aria-label="Tags"
			value={picked}
			onValueChange={(value) => onChange(value as TagId[])}
			className="flex flex-wrap gap-[7px]"
		>
			{tags.map((tag) => (
				<ToggleGroup.Item key={tag.id} value={tag.id} className={CHIP}>
					{tag.name}
				</ToggleGroup.Item>
			))}
		</ToggleGroup.Root>
	);
}
