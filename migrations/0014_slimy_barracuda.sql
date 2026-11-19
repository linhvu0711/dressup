CREATE TABLE `picture` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`owned_item_id` text,
	`bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owned_item_id`) REFERENCES `owned_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `picture_userId_idx` ON `picture` (`user_id`);--> statement-breakpoint
CREATE INDEX `picture_ownedItemId_idx` ON `picture` (`owned_item_id`);