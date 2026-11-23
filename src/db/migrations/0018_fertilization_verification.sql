CREATE TABLE `fertilization_verification_queue` (
	`core_ticket_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`work_date` text NOT NULL,
	`stage` text,
	`block_code` text NOT NULL,
	`sub_blok_name` text,
	`worker_id` integer NOT NULL,
	`worker_name` text NOT NULL,
	`gang_name` text,
	`fertilizer_name` text NOT NULL,
	`method` text NOT NULL,
	`application_round` integer,
	`tree_count` integer NOT NULL,
	`qty_kg` real NOT NULL,
	`mobile_uuid` text,
	`created_by` text,
	`fetched_at` text NOT NULL
);
