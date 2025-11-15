import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().defaultRandom().primaryKey(),
  phone: varchar({ length: 15 }).notNull().unique(),
  password: varchar({ length: 32 }),
  name: varchar({ length: 75 })
});
