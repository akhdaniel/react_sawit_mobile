CREATE TABLE `maintenance_verification_queue` (
	`core_ticket_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`work_date` text NOT NULL,
	`stage` text,
	`block_code` text NOT NULL,
	`sub_blok_name` text,
	`worker_id` integer NOT NULL,
	`worker_name` text NOT NULL,
	`gang_name` text,
	`work_type` text NOT NULL,
	`area_ha` real NOT NULL,
	`tree_count` integer NOT NULL,
	`hk` real NOT NULL,
	`materials` text NOT NULL,
	`mobile_uuid` text,
	`created_by` text,
	`fetched_at` text NOT NULL
);
