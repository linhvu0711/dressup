import { cn } from "cn";
import { ToggleGroup } from "radix-ui";
import { type Dispatch, type SetStateAction, useState } from "react";
import { CHIP, CHIP_DASHED } from "@/components/ui/chip";
import { TagNameTaken, useAddTag, useTags } from "./api";
import { TagNameField } from "./TagNameField";
import type { TagId } from "./tag";

// The tag chips of the save form (docs/prototype/dressup.html:935-937):
// several can be on, and "+ New tag" makes a tag and turns it on.
export function TagPicker({
	picked,
	onChange,
}: {
	picked: TagId[];
	onChange: Dispatch<SetStateAction<TagId[]>>;
}) {
	const tags = useTags();
	const add = useAddTag();
	const [adding, setAdding] = useState(false);
	const [failed, setFailed] = useState(false);

	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-medium text-[12.5px] text-muted-foreground">
				Tags
			</span>
			<div className="flex flex-wrap gap-[7px]">
				{tags.data?.length ? (
					<ToggleGroup.Root
						type="multiple"
						aria-label="Tags"
						value={picked}
						onValueChange={(value) => onChange(value as TagId[])}
						className="flex flex-wrap gap-[7px]"
					>
						{tags.data.map((tag) => (
							<ToggleGroup.Item key={tag.id} value={tag.id} className={CHIP}>
								{tag.name}
							</ToggleGroup.Item>
						))}
					</ToggleGroup.Root>
				) : null}
				{adding ? (
					<TagNameField
						label="New tag"
						saveLabel="Add tag"
						boxClassName="h-[30px] w-[130px]"
						onSave={async (name) => {
							try {
								const tag = await add.mutateAsync(name);
								// Chips stay clickable while the add runs, so the new tag
								// joins the picks as they are now, not as they were.
								onChange((now) => [...now, tag.id]);
							} catch (error) {
								if (error instanceof TagNameTaken) throw error;
								setFailed(true);
							}
							setAdding(false);
						}}
						onCancel={() => setAdding(false)}
					/>
				) : (
					<button
						type="button"
						className={cn(CHIP, CHIP_DASHED)}
						onClick={() => {
							setAdding(true);
							setFailed(false);
						}}
					>
						+ New tag
					</button>
				)}
			</div>
			{failed ? (
				<p role="alert" className="text-[13px] text-destructive">
					Not saved. Try again.
				</p>
			) : null}
		</div>
	);
}
