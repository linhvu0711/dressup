import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useColours } from "@/labels/api";
import { BrandsPart } from "@/labels/BrandsPart";
import { useBrands } from "@/labels/brand-api";
import { ColoursPart } from "@/labels/ColoursPart";
import { PageHeader } from "../shell/PageHeader";

type Part = "colours" | "brands";

const PARTS: { value: Part; label: string; add: string }[] = [
	{ value: "colours", label: "Colours", add: "Add a colour" },
	{ value: "brands", label: "Brands", add: "Add a brand" },
];

const CONTENT = "flex min-h-0 flex-1 flex-col";

// The lists the account makes once and uses everywhere: colours and brands.
export function LabelsPage() {
	const colours = useColours();
	const brands = useBrands();
	const [part, setPart] = useState<Part>("colours");
	const [adding, setAdding] = useState(false);
	const shown = PARTS.find((p) => p.value === part) ?? PARTS[0];
	const loaded = part === "colours" ? colours.data : brands.data;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title="Labels"
				end={
					<Button
						variant="primary"
						size="icon"
						aria-label={shown.add}
						title={shown.add}
						disabled={!loaded}
						onClick={() => setAdding(true)}
					>
						<Plus size={18} strokeWidth={1.9} aria-hidden />
					</Button>
				}
			/>
			<Tabs
				value={part}
				onValueChange={(value) => {
					const next = PARTS.find((p) => p.value === value);
					if (next) setPart(next.value);
				}}
				className={CONTENT}
			>
				<TabsList
					aria-label="Labels"
					className="mx-4 mb-2 wide:mx-auto wide:w-full wide:max-w-[540px]"
				>
					{PARTS.map((p) => (
						<TabsTrigger key={p.value} value={p.value}>
							{p.label}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value="colours" className={CONTENT}>
					<ColoursPart
						colours={colours}
						adding={adding && part === "colours"}
						onAddClose={() => setAdding(false)}
					/>
				</TabsContent>
				<TabsContent value="brands" className={CONTENT}>
					<BrandsPart
						brands={brands}
						adding={adding && part === "brands"}
						onAddClose={() => setAdding(false)}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
