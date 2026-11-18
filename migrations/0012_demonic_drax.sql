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