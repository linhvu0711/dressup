import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

// Shapes and sizes of the prototype's .btn and .ib (docs/prototype/dressup.html:36-52).
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap border font-medium transition-[background-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
	{
		variants: {
			variant: {
				default: "rounded-[999px] border-border bg-card hover:bg-muted",
				primary:
					"rounded-[999px] border-primary bg-primary text-primary-foreground hover:opacity-86",
				destructive:
					"rounded-[999px] border-destructive bg-destructive text-white hover:opacity-86",
				icon: "rounded-[50%] border-border bg-transparent text-foreground hover:bg-muted aria-[current=page]:bg-muted",
			},
			size: {
				default: "h-[38px] px-4 text-[13.5px]",
				lg: "h-[46px] px-5 text-[14.5px]",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-lg": "size-11",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
