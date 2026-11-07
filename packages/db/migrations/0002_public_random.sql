CREATE TABLE `dish_preferences` (
	`user_id` text NOT NULL,
	`dish_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `dish_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dish_preferences_kind_check" CHECK("dish_preferences"."kind" in ('like', 'dislike'))
);
