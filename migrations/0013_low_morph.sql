CREATE TABLE `combination_tag` (
	`user_id` text NOT NULL,
	`combination_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`combination_id`, `tag_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`combination_id`) REFERENCES `combination`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `combination_tag_userId_idx` ON `combination_tag` (`user_id`);--> statement-breakpoint
CREATE INDEX `combination_tag_tagId_idx` ON `combination_tag` (`tag_id`);