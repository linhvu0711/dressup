CREATE TABLE `colour_square` (
	`user_id` text NOT NULL,
	`garment` text NOT NULL,
	`hex` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`user_id`, `garment`, `hex`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outfit` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mode_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outfit_garment` (
	`user_id` text NOT NULL,
	`garment` text NOT NULL,
	`hex` text NOT NULL,
	`open` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `garment`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
