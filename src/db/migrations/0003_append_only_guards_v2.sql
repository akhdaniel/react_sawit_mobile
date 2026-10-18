-- DIHASILKAN OLEH scripts/gen-guard-triggers.ts — jangan diedit manual.
DROP TRIGGER IF EXISTS `attendance_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `attendance_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `attendance_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `attendance_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `attendance_guard_insert_status` BEFORE INSERT ON `attendance`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `attendance_guard_immutable` BEFORE UPDATE ON `attendance`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`work_date` IS NOT OLD.`work_date` OR NEW.`employee_id` IS NOT OLD.`employee_id` OR NEW.`gang_id` IS NOT OLD.`gang_id` OR NEW.`type` IS NOT OLD.`type` OR NEW.`att_status` IS NOT OLD.`att_status` OR NEW.`late_reason` IS NOT OLD.`late_reason` OR NEW.`photo_id` IS NOT OLD.`photo_id` OR NEW.`outside_afdeling` IS NOT OLD.`outside_afdeling`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `attendance_guard_transition` BEFORE UPDATE OF status ON `attendance`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `attendance_guard_delete` BEFORE DELETE ON `attendance`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `assignment_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `assignment_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `assignment_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `assignment_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `assignment_guard_insert_status` BEFORE INSERT ON `assignment`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `assignment_guard_immutable` BEFORE UPDATE ON `assignment`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`work_date` IS NOT OLD.`work_date` OR NEW.`work_plan_id` IS NOT OLD.`work_plan_id` OR NEW.`unplanned_reason` IS NOT OLD.`unplanned_reason` OR NEW.`activity_id` IS NOT OLD.`activity_id` OR NEW.`block_id` IS NOT OLD.`block_id` OR NEW.`employee_ids` IS NOT OLD.`employee_ids`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `assignment_guard_transition` BEFORE UPDATE OF status ON `assignment`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `assignment_guard_delete` BEFORE DELETE ON `assignment`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `harvest_ticket_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `harvest_ticket_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `harvest_ticket_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `harvest_ticket_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `harvest_ticket_guard_insert_status` BEFORE INSERT ON `harvest_ticket`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `harvest_ticket_guard_immutable` BEFORE UPDATE ON `harvest_ticket`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`work_date` IS NOT OLD.`work_date` OR NEW.`ticket_no` IS NOT OLD.`ticket_no` OR NEW.`tph_id` IS NOT OLD.`tph_id` OR NEW.`block_id` IS NOT OLD.`block_id` OR NEW.`harvester_employee_id` IS NOT OLD.`harvester_employee_id` OR NEW.`ripe` IS NOT OLD.`ripe` OR NEW.`unripe` IS NOT OLD.`unripe` OR NEW.`rotten` IS NOT OLD.`rotten` OR NEW.`empty_bunch` IS NOT OLD.`empty_bunch` OR NEW.`long_stalk` IS NOT OLD.`long_stalk` OR NEW.`loose_fruit_kg` IS NOT OLD.`loose_fruit_kg` OR NEW.`est_kg` IS NOT OLD.`est_kg` OR NEW.`photo_id` IS NOT OLD.`photo_id` OR NEW.`is_late_entry` IS NOT OLD.`is_late_entry`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `harvest_ticket_guard_transition` BEFORE UPDATE OF status ON `harvest_ticket`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `harvest_ticket_guard_delete` BEFORE DELETE ON `harvest_ticket`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `spb_guard_insert_status` BEFORE INSERT ON `spb`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `spb_guard_immutable` BEFORE UPDATE ON `spb`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`work_date` IS NOT OLD.`work_date` OR NEW.`spb_no` IS NOT OLD.`spb_no` OR NEW.`vehicle_id` IS NOT OLD.`vehicle_id` OR NEW.`driver_name` IS NOT OLD.`driver_name` OR NEW.`destination` IS NOT OLD.`destination` OR NEW.`parent_spb_uuid` IS NOT OLD.`parent_spb_uuid` OR NEW.`total_bunch` IS NOT OLD.`total_bunch` OR NEW.`est_kg` IS NOT OLD.`est_kg` OR NEW.`photo_ids` IS NOT OLD.`photo_ids`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `spb_guard_transition` BEFORE UPDATE OF status ON `spb`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `spb_guard_delete` BEFORE DELETE ON `spb`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `upkeep_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `upkeep_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `upkeep_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `upkeep_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `upkeep_guard_insert_status` BEFORE INSERT ON `upkeep`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `upkeep_guard_immutable` BEFORE UPDATE ON `upkeep`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`work_date` IS NOT OLD.`work_date` OR NEW.`activity_id` IS NOT OLD.`activity_id` OR NEW.`block_id` IS NOT OLD.`block_id` OR NEW.`employee_ids` IS NOT OLD.`employee_ids` OR NEW.`hk` IS NOT OLD.`hk` OR NEW.`realized_ha` IS NOT OLD.`realized_ha` OR NEW.`realized_trees` IS NOT OLD.`realized_trees` OR NEW.`photo_id` IS NOT OLD.`photo_id`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `upkeep_guard_transition` BEFORE UPDATE OF status ON `upkeep`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `upkeep_guard_delete` BEFORE DELETE ON `upkeep`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `material_usage_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `material_usage_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `material_usage_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `material_usage_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `material_usage_guard_insert_status` BEFORE INSERT ON `material_usage`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `material_usage_guard_immutable` BEFORE UPDATE ON `material_usage`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`upkeep_uuid` IS NOT OLD.`upkeep_uuid` OR NEW.`product_id` IS NOT OLD.`product_id` OR NEW.`qty` IS NOT OLD.`qty` OR NEW.`uom` IS NOT OLD.`uom` OR NEW.`over_dose` IS NOT OLD.`over_dose` OR NEW.`approval_note` IS NOT OLD.`approval_note`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `material_usage_guard_transition` BEFORE UPDATE OF status ON `material_usage`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `material_usage_guard_delete` BEFORE DELETE ON `material_usage`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `daily_report_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `daily_report_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `daily_report_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `daily_report_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `daily_report_guard_insert_status` BEFORE INSERT ON `daily_report`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `daily_report_guard_immutable` BEFORE UPDATE ON `daily_report`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`date` IS NOT OLD.`date` OR NEW.`gang_id` IS NOT OLD.`gang_id` OR NEW.`summary_json` IS NOT OLD.`summary_json` OR NEW.`signature_png_id` IS NOT OLD.`signature_png_id`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `daily_report_guard_transition` BEFORE UPDATE OF status ON `daily_report`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `daily_report_guard_delete` BEFORE DELETE ON `daily_report`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_decision_guard_insert_status`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_decision_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_decision_guard_transition`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_decision_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `approval_decision_guard_insert_status` BEFORE INSERT ON `approval_decision`
WHEN NEW.status NOT IN ('draft', 'queued', 'sent', 'accepted', 'rejected', 'posted')
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `approval_decision_guard_immutable` BEFORE UPDATE ON `approval_decision`
WHEN OLD.status NOT IN ('draft', 'queued') AND (NEW.`mobile_uuid` IS NOT OLD.`mobile_uuid` OR NEW.`user_id` IS NOT OLD.`user_id` OR NEW.`device_id` IS NOT OLD.`device_id` OR NEW.`created_trusted_at` IS NOT OLD.`created_trusted_at` OR NEW.`device_time_at` IS NOT OLD.`device_time_at` OR NEW.`time_source` IS NOT OLD.`time_source` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked` OR NEW.`rooted` IS NOT OLD.`rooted` OR NEW.`correction_of` IS NOT OLD.`correction_of` OR NEW.`target_uuid` IS NOT OLD.`target_uuid` OR NEW.`target_type` IS NOT OLD.`target_type` OR NEW.`decision` IS NOT OLD.`decision` OR NEW.`note` IS NOT OLD.`note` OR NEW.`corrected_json` IS NOT OLD.`corrected_json`)
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `approval_decision_guard_transition` BEFORE UPDATE OF status ON `approval_decision`
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'draft' AND NEW.status IN ('queued')) OR (OLD.status = 'queued' AND NEW.status IN ('draft', 'sent', 'accepted', 'rejected')) OR (OLD.status = 'sent' AND NEW.status IN ('queued', 'accepted', 'rejected', 'posted')) OR (OLD.status = 'accepted' AND NEW.status IN ('posted', 'rejected')))
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER `approval_decision_guard_delete` BEFORE DELETE ON `approval_decision`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_line_guard_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_line_guard_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spb_line_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `spb_line_guard_insert` BEFORE INSERT ON `spb_line`
WHEN EXISTS (SELECT 1 FROM spb WHERE spb.mobile_uuid = NEW.spb_uuid AND spb.status NOT IN ('draft', 'queued'))
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `spb_line_guard_update` BEFORE UPDATE ON `spb_line`
WHEN EXISTS (SELECT 1 FROM spb WHERE spb.mobile_uuid = OLD.spb_uuid AND spb.status NOT IN ('draft', 'queued')) OR EXISTS (SELECT 1 FROM spb WHERE spb.mobile_uuid = NEW.spb_uuid AND spb.status NOT IN ('draft', 'queued'))
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER `spb_line_guard_delete` BEFORE DELETE ON `spb_line`
WHEN EXISTS (SELECT 1 FROM spb WHERE spb.mobile_uuid = OLD.spb_uuid AND spb.status NOT IN ('draft', 'queued'))
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `photo_guard_immutable`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `photo_guard_delete`;
--> statement-breakpoint
CREATE TRIGGER `photo_guard_immutable` BEFORE UPDATE ON `photo`
WHEN NEW.`id` IS NOT OLD.`id` OR NEW.`sha256` IS NOT OLD.`sha256` OR NEW.`size_bytes` IS NOT OLD.`size_bytes` OR NEW.`taken_trusted_at` IS NOT OLD.`taken_trusted_at` OR NEW.`lat` IS NOT OLD.`lat` OR NEW.`lng` IS NOT OLD.`lng` OR NEW.`accuracy_m` IS NOT OLD.`accuracy_m` OR NEW.`mocked` IS NOT OLD.`mocked`
BEGIN SELECT RAISE(ABORT, 'PHOTO_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `photo_guard_delete` BEFORE DELETE ON `photo`
WHEN OLD.upload_status = 'uploaded'
BEGIN SELECT RAISE(ABORT, 'PHOTO_IMMUTABLE'); END;
