import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const datasets=sqliteTable('radar_datasets',{
  owner:text('owner').notNull(),
  mode:text('mode').notNull(),
  version:integer('version').notNull().default(0),
  data:text('data').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.owner,t.mode]})]);
