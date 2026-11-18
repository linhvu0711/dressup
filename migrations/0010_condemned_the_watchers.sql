CREATE TABLE `combination` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`open` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `combination_userId_key_uq` ON `combination` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `combination_piece` (
	`combination_id` text NOT NULL,
	`user_id` text NOT NULL,
	`layer` text NOT NULL,
	`type_id` text NOT NULL,
	`colour_id` text NOT NULL,
	PRIMARY KEY(`combination_id`, `layer`),
	FOREIGN KEY (`combination_id`) REFERENCES `combination`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colour_id`) REFERENCES `colour`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `combination_piece_colourId_idx` ON `combination_piece` (`colour_id`);