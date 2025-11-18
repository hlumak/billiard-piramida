import { relations } from 'drizzle-orm';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { bookings } from '../schema';

export const users = pgTable('users', {
  id: uuid().defaultRandom().primaryKey(),
  phone: varchar({ length: 15 }).notNull().unique(),
  password: varchar({ length: 72 }),
  name: varchar({ length: 75 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings)
}));
