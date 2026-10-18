import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_append_only_guards.sql';
import m0002 from './0002_time_source.sql';
import m0003 from './0003_append_only_guards_v2.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003
    }
  }
  