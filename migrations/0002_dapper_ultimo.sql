CREATE TABLE `mannequin` (
	`user_id` text PRIMARY KEY NOT NULL,
	`skin` text NOT NULL,
	`hair` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
