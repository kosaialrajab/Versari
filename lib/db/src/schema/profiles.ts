import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const profilesTable = pgTable("versari_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  university: text("university").notNull(),
  verifiedSchool: text("verified_school"),
  program: text("program").notNull(),
  year: text("year").notNull(),
  bio: text("bio").notNull().default(""),
  interests: text("interests").array().notNull().default([]),
  lookingFor: text("looking_for").array().notNull().default([]),
  studyStyle: text("study_style").notNull().default(""),
  availability: text("availability").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
