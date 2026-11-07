ALTER TABLE `recommendations` ADD `batch_id` text;--> statement-breakpoint
CREATE INDEX `recommendations_batch_idx` ON `recommendations` (`batch_id`);