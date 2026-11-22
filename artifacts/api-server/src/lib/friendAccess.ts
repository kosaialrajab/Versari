import { and, eq, inArray, or } from "drizzle-orm";
import { connectionsTable, db, profilesTable } from "@workspace/db";
import type { VersariSchool } from "./schoolAccess";

export async function getVerifiedFriendIds(
  userId: string,
  school: VersariSchool,
): Promise<string[]> {
  const friendships = await db
    .select({
      requesterId: connectionsTable.requesterId,
      recipientId: connectionsTable.recipientId,
    })
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.status, "accepted"),
        or(
          eq(connectionsTable.requesterId, userId),
          eq(connectionsTable.recipientId, userId),
        ),
      ),
    );
  const possibleIds = Array.from(
    new Set(
      friendships.map((friendship) =>
        friendship.requesterId === userId
          ? friendship.recipientId
          : friendship.requesterId,
      ),
    ),
  );
  if (!possibleIds.length) return [];

  const verifiedProfiles = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(
      and(
        inArray(profilesTable.userId, possibleIds),
        eq(profilesTable.verifiedSchool, school),
      ),
    );
  return verifiedProfiles.map((profile) => profile.userId);
}

export async function areAcceptedFriends(
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  if (firstUserId === secondUserId) return false;
  const [friendship] = await db
    .select({ id: connectionsTable.id })
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.status, "accepted"),
        or(
          and(
            eq(connectionsTable.requesterId, firstUserId),
            eq(connectionsTable.recipientId, secondUserId),
          ),
          and(
            eq(connectionsTable.requesterId, secondUserId),
            eq(connectionsTable.recipientId, firstUserId),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(friendship);
}
