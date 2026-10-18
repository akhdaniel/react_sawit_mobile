CREATE TABLE `approval_inbox` (
	`target_uuid` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`summary` text NOT NULL,
	`flags` text NOT NULL,
	`afdeling_id` integer NOT NULL,
	`fetched_at` text NOT NULL
);
