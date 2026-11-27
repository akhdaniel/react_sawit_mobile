// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_append_only_guards.sql';
import m0002 from './0002_time_source.sql';
import m0003 from './0003_append_only_guards_v2.sql';
import m0004 from './0004_approval_inbox.sql';
import m0005 from './0005_employee_nfc.sql';
import m0006 from './0006_backend_structure_masters.sql';
import m0007 from './0007_drop_penalty_rule.sql';
import m0008 from './0008_append_only_guards_v3.sql';
import m0009 from './0009_reset_master_cursor.sql';
import m0010 from './0010_fertilization_ticket.sql';
import m0011 from './0011_append_only_guards_v4.sql';
import m0012 from './0012_reset_master_cursor_fertilization.sql';
import m0013 from './0013_maintenance_ticket.sql';
import m0014 from './0014_append_only_guards_v5.sql';
import m0015 from './0015_reset_master_cursor_maintenance.sql';
import m0016 from './0016_stage_confirm.sql';
import m0017 from './0017_append_only_guards_v6.sql';
import m0018 from './0018_fertilization_verification.sql';
import m0019 from './0019_maintenance_verification.sql';
import m0020 from './0020_inspection.sql';
import m0021 from './0021_append_only_guards_v7.sql';
import m0022 from './0022_reset_master_cursor_inspection.sql';
import m0023 from './0023_present_worker.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016,
m0017,
m0018,
m0019,
m0020,
m0021,
m0022,
m0023
    }
  }
  