CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`dish_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_created_idx` ON `chat_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT 'vi' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_threads_user_created_idx` ON `chat_threads` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_vi` text NOT NULL,
	`name_en` text NOT NULL,
	`price_vnd` integer NOT NULL,
	`price_min_vnd` integer NOT NULL,
	`price_max_vnd` integer NOT NULL,
	`meal_types` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`region` text DEFAULT 'any' NOT NULL,
	`prep_minutes` integer DEFAULT 15 NOT NULL,
	`fill_level` integer DEFAULT 2 NOT NULL,
	`desc_vi` text DEFAULT '' NOT NULL,
	`desc_en` text DEFAULT '' NOT NULL,
	`is_seed` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dishes_slug_unique` ON `dishes` (`slug`);--> statement-breakpoint
CREATE INDEX `dishes_price_idx` ON `dishes` (`price_vnd`);--> statement-breakpoint
CREATE TABLE `plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`meal_type` text NOT NULL,
	`dish_id` text NOT NULL,
	`price_vnd` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `plan_items_plan_day_idx` ON `plan_items` (`plan_id`,`day_index`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`days` integer NOT NULL,
	`budget_unit` text NOT NULL,
	`budget_amount` integer NOT NULL,
	`daily_budget_vnd` integer NOT NULL,
	`role_slug` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plans_user_created_idx` ON `plans` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`role_slug` text NOT NULL,
	`budget_unit` text NOT NULL,
	`budget_amount` integer NOT NULL,
	`daily_budget_vnd` integer NOT NULL,
	`meal_type` text NOT NULL,
	`dish_ids` text NOT NULL,
	`total_vnd` integer NOT NULL,
	`rationale_vi` text DEFAULT '' NOT NULL,
	`rationale_en` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recommendations_user_created_idx` ON `recommendations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`slug` text PRIMARY KEY NOT NULL,
	`name_vi` text NOT NULL,
	`name_en` text NOT NULL,
	`desc_vi` text DEFAULT '' NOT NULL,
	`desc_en` text DEFAULT '' NOT NULL,
	`default_daily_budget_vnd` integer NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`icon` text DEFAULT 'utensils' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`locale` text DEFAULT 'vi' NOT NULL,
	`role_slug` text,
	`daily_budget_vnd` integer,
	`diet_tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);