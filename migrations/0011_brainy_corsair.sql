CREATE TABLE `owned_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type_id` text NOT NULL,
	`colour_id` text NOT NULL,
	`brand_id` text,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colour_id`) REFERENCES `colour`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brand`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `owned_item_userId_idx` ON `owned_item` (`user_id`);--> statement-breakpoint
CREATE INDEX `owned_item_colourId_idx` ON `owned_item` (`colour_id`);--> statement-breakpoint
CREATE INDEX `owned_item_brandId_idx` ON `owned_item` (`brand_id`);