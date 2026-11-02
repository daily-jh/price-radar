import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const source=process.env.DATABASE_PATH||'data/radar.sqlite';
const target=resolve(process.argv[2]||`data/backups/radar-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
mkdirSync(dirname(target),{recursive:true});
const db=new DatabaseSync(source);db.prepare('VACUUM INTO ?').run(target);db.close();console.log('백업 저장: '+target);
