import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const activityRequestsTable = pgTable("versari_activity_requests", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id")
    .notNull()
    .references(() => profilesTable.userId, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => profilesTable.userId, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertActivityRequestSchema = createInsertSchema(
  activityRequestsTable,
).omit({ createdAt: true });
export type InsertActivityRequest = z.infer<typeof insertActivityRequestSchema>;
export type ActivityRequest = typeof activityRequestsTable.$inferSelect;
