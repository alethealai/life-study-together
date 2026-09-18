import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const gardens=sqliteTable('gardens',{id:text('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
