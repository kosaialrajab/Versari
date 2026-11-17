import { Router, type IRouter } from "express";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import {
  connectionsTable,
  db,
  meetupsTable,
  profilesTable,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { getVersariSchool, requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const [profile] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (!profile) {
    res.json(
      GetDashboardSummaryResponse.parse({
        studentCount: 0,
        studyMeetupCount: 0,
        playMeetupCount: 0,
        incomingRequests: 0,
        connections: 0,
      }),
    );
    return;
  }
  const campusUsers = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.verifiedSchool, school));
  const campusUserIds = campusUsers.map(({ userId: campusUserId }) => campusUserId);
  const now = new Date();
  const [
    [studentCount],
    [studyMeetupCount],
    [playMeetupCount],
    [incomingRequests],
    [connections],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(profilesTable)
      .where(eq(profilesTable.verifiedSchool, school)),
    db
      .select({ value: count() })
      .from(meetupsTable)
      .innerJoin(profilesTable, eq(meetupsTable.creatorId, profilesTable.userId))
      .where(
        and(
          eq(meetupsTable.mode, "study"),
          gt(meetupsTable.startsAt, now),
          eq(profilesTable.verifiedSchool, school),
        ),
      ),
    db
      .select({ value: count() })
      .from(meetupsTable)
      .innerJoin(profilesTable, eq(meetupsTable.creatorId, profilesTable.userId))
      .where(
        and(
          eq(meetupsTable.mode, "play"),
          gt(meetupsTable.startsAt, now),
          eq(profilesTable.verifiedSchool, school),
        ),
      ),
    db
      .select({ value: count() })
      .from(connectionsTable)
      .where(
        and(
          eq(connectionsTable.recipientId, userId),
          eq(connectionsTable.status, "pending"),
          inArray(connectionsTable.requesterId, campusUserIds),
        ),
      ),
    db
      .select({ value: count() })
      .from(connectionsTable)
      .where(
        and(
          eq(connectionsTable.status, "accepted"),
          // Count accepted connections involving the signed-in member.
          eq(connectionsTable.requesterId, userId),
          inArray(connectionsTable.recipientId, campusUserIds),
        ),
      ),
  ]);
  const [receivedConnections] = await db
    .select({ value: count() })
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.status, "accepted"),
        eq(connectionsTable.recipientId, userId),
        inArray(connectionsTable.requesterId, campusUserIds),
      ),
    );
  res.json(
    GetDashboardSummaryResponse.parse({
      studentCount: Number(studentCount?.value ?? 0),
      studyMeetupCount: Number(studyMeetupCount?.value ?? 0),
      playMeetupCount: Number(playMeetupCount?.value ?? 0),
      incomingRequests: Number(incomingRequests?.value ?? 0),
      connections:
        Number(connections?.value ?? 0) +
        Number(receivedConnections?.value ?? 0),
    }),
  );
});

export default router;
