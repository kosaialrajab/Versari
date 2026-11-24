import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const meetupsTable = pgTable("versari_meetups", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id")
    .notNull()
    .references(() => profilesTable.userId, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  description: text("description").notNull().default(""),
  location: text("location").notNull(),
  isOnline: boolean("is_online").notNull().default(false),
  onlineCallUrl: text("online_call_url"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const meetupMembersTable = pgTable(
  "versari_meetup_members",
  {
    meetupId: text("meetup_id")
      .notNull()
      .references(() => meetupsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profilesTable.userId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.meetupId, table.userId] })],
);

export const insertMeetupSchema = createInsertSchema(meetupsTable).omit({
  createdAt: true,
});
export const insertMeetupMemberSchema = createInsertSchema(
  meetupMembersTable,
).omit({ joinedAt: true });
export type InsertMeetup = z.infer<typeof insertMeetupSchema>;
export type InsertMeetupMember = z.infer<typeof insertMeetupMemberSchema>;
export type Meetup = typeof meetupsTable.$inferSelect;
export type MeetupMember = typeof meetupMembersTable.$inferSelect;
