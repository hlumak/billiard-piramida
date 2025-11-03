import { pgTable, serial, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial().primaryKey(),
  phone: text().notNull().unique(),
  password: text().notNull(),
  firstName: text('first_name'),
  lastName: text('last_name')
});
