import { cn } from "cn";
import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { INPUT } from "@/components/ui/sheet-form";
import { isNameTaken } from "@/data/client";
import { sameLabelName } from "@/labels/name";
import { useTags } from "./api";
import { TAG_NAME_MAX } from "./tag";

// One box for a tag name: the add box of the save form and of Edit tags.
// Return saves; Escape is left to the dialog, which closes.
export function TagNameField({
	label,
	saveLabel,
	boxClassName,
	onSave,
	onCancel,
}: {
	label: string;
	saveLabel: string;
	boxClassName?: string;
	// Rejects with the server's duplicate refusal when it finds the name
	// taken; the caller handles every other failure.
	onSave: (name: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [name, setName] = useState("");
	const [taken, setTaken] = useState(false);
	const [saving, setSaving] = useState(false);
	const box = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const tags = useTags();

	useEffect(() => box.current?.focus(), []);

	const save = async () => {
		// Enter is not held off by the disabled button.
		if (saving) return;
		const trimmed = name.trim();
		// An empty name sends nothing.
		if (!trimmed) return onCancel();
		if (tags.data?.some((t) => sameLabelName(t.name, trimmed))) {
			setTaken(true);
			return;
		}
		setSaving(true);
		try {
			await onSave(trimmed);
		} catch (error) {
			if (!isNameTaken(error)) throw error;
			setTaken(true);
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<input
					ref={box}
					value={name}
					onChange={(e) => {
						setName(e.target.value);
						setTaken(false);
					}}
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						// Return in the save form would send the form.
						e.preventDefault();
						void save();
					}}
					maxLength={TAG_NAME_MAX}
					autoComplete="off"
					aria-label={label}
					placeholder="Tag name"
					aria-invalid={taken || undefined}
					aria-describedby={taken ? hintId : undefined}
					className={cn(INPUT, boxClassName)}
				/>
				{/* Button sets no type, and in the save form a button with none sends the form. */}
				<Button
					type="button"
					variant="icon"
					size="icon-sm"
					aria-label={saveLabel}
					disabled={saving}
					onClick={() => void save()}
				>
					<Check size={16} strokeWidth={1.9} />
				</Button>
				<Button
					type="button"
					variant="icon"
					size="icon-sm"
					aria-label="Cancel tag"
					onClick={onCancel}
				>
					<X size={16} strokeWidth={1.9} />
				</Button>
			</div>
			{taken ? (
				<p id={hintId} className="text-[12.5px] text-destructive">
					You have this tag already
				</p>
			) : null}
		</div>
	);
}
