CREATE TABLE `shop_link` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`wish_id` text NOT NULL,
	`url` text NOT NULL,
	`brand_id` text,
	`name` text NOT NULL,
	`price` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wish_id`) REFERENCES `wish`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `brand`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shop_link_wishId_idx` ON `shop_link` (`wish_id`);--> statement-breakpoint
CREATE INDEX `shop_link_brandId_idx` ON `shop_link` (`brand_id`);--> statement-breakpoint
CREATE INDEX `shop_link_userId_idx` ON `shop_link` (`user_id`);--> statement-breakpoint
CREATE TABLE `wish` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type_id` text NOT NULL,
	`colour_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colour_id`) REFERENCES `colour`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wish_userId_typeId_colourId_uq` ON `wish` (`user_id`,`type_id`,`colour_id`);--> statement-breakpoint
CREATE INDEX `wish_colourId_idx` ON `wish` (`colour_id`);