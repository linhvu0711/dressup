CREATE TABLE `look` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode_id` text NOT NULL,
	`name` text NOT NULL,
	`colours` text NOT NULL,
	`open` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `look_userId_idx` ON `look` (`user_id`);