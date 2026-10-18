ALTER TABLE `approval_decision` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_report` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `harvest_ticket` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `material_usage` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `spb` ADD `time_source` text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE `upkeep` ADD `time_source` text DEFAULT 'device' NOT NULL;