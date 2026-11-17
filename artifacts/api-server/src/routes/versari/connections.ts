import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  CreateConnectionBody,
  CreateConnectionResponse,
  ListConnectionsResponse,
  UpdateConnectionBody,
  UpdateConnectionParams,
  UpdateConnectionResponse,
} from "@workspace/api-zod";
import { connectionsTable, db, profilesTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { getVersariSchool, requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

async function connectionWithStudent(
  id: string,
  currentUserId: string,
  school: string,
): Promise<unknown | null> {
  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.id, id))
    .limit(1);
  if (!connection) return null;

  const otherUserId =
    connection.requesterId === currentUserId
      ? connection.recipientId
      : connection.requesterId;
  const [otherStudent] = await db
    .select()
    .from(profilesTable)
    .where(
      and(
        eq(profilesTable.userId, otherUserId),
        eq(profilesTable.verifiedSchool, school),
      ),
    )
    .limit(1);
  if (!otherStudent) return null;

  return {
    id: connection.id,
    requesterId: connection.requesterId,
    recipientId: connection.recipientId,
    status: connection.status,
    otherStudent: {
      userId: otherStudent.userId,
      displayName: otherStudent.displayName,
      university: otherStudent.university,
      program: otherStudent.program,
      year: otherStudent.year,
      bio: otherStudent.bio,
      interests: otherStudent.interests,
      lookingFor: otherStudent.lookingFor,
      studyStyle: otherStudent.studyStyle,
      availability: otherStudent.availability,
    },
  };
}

router.get("/connections", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const connections = await db
    .select()
    .from(connectionsTable)
    .where(
      or(
        eq(connectionsTable.requesterId, userId),
        eq(connectionsTable.recipientId, userId),
      ),
    )
    .orderBy(desc(connectionsTable.createdAt));
  const otherUserIds = connections.map((connection) =>
    connection.requesterId === userId
      ? connection.recipientId
      : connection.requesterId,
  );
  const profiles = otherUserIds.length
    ? await db
        .select()
        .from(profilesTable)
      .where(
        and(
          inArray(profilesTable.userId, otherUserIds),
          eq(profilesTable.verifiedSchool, school),
        ),
      )
    : [];
  const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
  const items = connections.flatMap((connection) => {
    const otherUserId =
      connection.requesterId === userId
        ? connection.recipientId
        : connection.requesterId;
    const otherStudent = profileMap.get(otherUserId);
    if (!otherStudent) return [];
    return [{
      id: connection.id,
      requesterId: connection.requesterId,
      recipientId: connection.recipientId,
      status: connection.status,
      otherStudent: {
        userId: otherStudent.userId,
        displayName: otherStudent.displayName,
        university: otherStudent.university,
        program: otherStudent.program,
        year: otherStudent.year,
        bio: otherStudent.bio,
        interests: otherStudent.interests,
        lookingFor: otherStudent.lookingFor,
        studyStyle: otherStudent.studyStyle,
        availability: otherStudent.availability,
      },
    }];
  });
  res.json(ListConnectionsResponse.parse(items));
});

router.post("/connections", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const parsed = CreateConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const recipientId = parsed.data.recipientId;
  if (recipientId === userId) {
    res.status(400).json({ error: "You cannot connect with yourself." });
    return;
  }
  const [recipient] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(
      and(
        eq(profilesTable.userId, recipientId),
        eq(profilesTable.verifiedSchool, school),
      ),
    )
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "Student not found." });
    return;
  }
  const existing = await db
    .select({ id: connectionsTable.id })
    .from(connectionsTable)
    .where(
      or(
        and(
          eq(connectionsTable.requesterId, userId),
          eq(connectionsTable.recipientId, recipientId),
        ),
        and(
          eq(connectionsTable.requesterId, recipientId),
          eq(connectionsTable.recipientId, userId),
        ),
      ),
    )
    .limit(1);
  if (existing.length) {
    res.status(409).json({ error: "A connection request already exists." });
    return;
  }
  const id = randomUUID();
  await db.insert(connectionsTable).values({
    id,
    requesterId: userId,
    recipientId,
    status: "pending",
  });
  const item = await connectionWithStudent(id, userId, school);
  res.status(201).json(CreateConnectionResponse.parse(item));
});

router.patch("/connections/:id", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const params = UpdateConnectionParams.safeParse(req.params);
  const parsed = UpdateConnectionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.id, params.data.id),
        eq(connectionsTable.recipientId, userId),
      ),
    )
    .limit(1);
  if (!connection) {
    res.status(404).json({ error: "Connection request not found." });
    return;
  }
  const sameCampusConnection = await connectionWithStudent(
    connection.id,
    userId,
    school,
  );
  if (!sameCampusConnection) {
    res.status(404).json({ error: "Connection request not found." });
    return;
  }
  if (connection.status !== "pending") {
    res.status(409).json({ error: "This request has already been answered." });
    return;
  }
  await db
    .update(connectionsTable)
    .set({ status: parsed.data.status })
    .where(eq(connectionsTable.id, connection.id));
  const item = await connectionWithStudent(connection.id, userId, school);
  res.json(UpdateConnectionResponse.parse(item));
});

export default router;
