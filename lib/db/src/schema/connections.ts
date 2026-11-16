import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const connectionsTable = pgTable("versari_connections", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id")
    .notNull()
    .references(() => profilesTable.userId, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => profilesTable.userId, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertConnectionSchema = createInsertSchema(connectionsTable).omit({
  createdAt: true,
});
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connectionsTable.$inferSelect;
