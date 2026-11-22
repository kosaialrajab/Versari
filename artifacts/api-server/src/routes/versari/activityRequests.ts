import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  CreateActivityRequestBody,
  CreateActivityRequestResponse,
  ListActivityRequestsResponse,
  UpdateActivityRequestBody,
  UpdateActivityRequestParams,
  UpdateActivityRequestResponse,
} from "@workspace/api-zod";
import {
  activityRequestsTable,
  db,
  profilesTable,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { areAcceptedFriends, getVerifiedFriendIds } from "../../lib/friendAccess";
import { getVersariSchool, requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

function studentForResponse(profile: typeof profilesTable.$inferSelect) {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    university: profile.university,
    program: profile.program,
    year: profile.year,
    bio: profile.bio,
    interests: profile.interests,
    lookingFor: profile.lookingFor,
    studyStyle: profile.studyStyle,
    availability: profile.availability,
  };
}

async function requestWithStudent(
  request: typeof activityRequestsTable.$inferSelect,
  currentUserId: string,
  school: ReturnType<typeof getVersariSchool>,
): Promise<unknown | null> {
  const otherUserId =
    request.requesterId === currentUserId
      ? request.recipientId
      : request.requesterId;
  if (!(await areAcceptedFriends(currentUserId, otherUserId))) return null;
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
  return { ...request, otherStudent: studentForResponse(otherStudent) };
}

router.get("/activity-requests", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const friendIds = await getVerifiedFriendIds(userId, school);
  if (!friendIds.length) {
    res.json(ListActivityRequestsResponse.parse([]));
    return;
  }

  const [requests, friendProfiles] = await Promise.all([
    db
      .select()
      .from(activityRequestsTable)
      .where(
        and(
          or(
            eq(activityRequestsTable.requesterId, userId),
            eq(activityRequestsTable.recipientId, userId),
          ),
          or(
            inArray(activityRequestsTable.requesterId, friendIds),
            inArray(activityRequestsTable.recipientId, friendIds),
          ),
        ),
      )
      .orderBy(desc(activityRequestsTable.createdAt))
      .limit(100),
    db
      .select()
      .from(profilesTable)
      .where(
        and(
          inArray(profilesTable.userId, friendIds),
          eq(profilesTable.verifiedSchool, school),
        ),
      ),
  ]);
  const profileMap = new Map(
    friendProfiles.map((profile) => [profile.userId, profile]),
  );
  const items = requests.flatMap((request) => {
    const otherUserId =
      request.requesterId === userId
        ? request.recipientId
        : request.requesterId;
    const otherStudent = profileMap.get(otherUserId);
    if (!otherStudent) return [];
    return [{ ...request, otherStudent: studentForResponse(otherStudent) }];
  });
  res.json(ListActivityRequestsResponse.parse(items));
});

router.post("/activity-requests", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const parsed = CreateActivityRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { recipientId, mode } = parsed.data;
  if (recipientId === userId) {
    res.status(400).json({ error: "You cannot send a request to yourself." });
    return;
  }
  const [sender, recipient] = await Promise.all([
    db
      .select({ userId: profilesTable.userId })
      .from(profilesTable)
      .where(
        and(
          eq(profilesTable.userId, userId),
          eq(profilesTable.verifiedSchool, school),
        ),
      )
      .limit(1),
    db
      .select({ userId: profilesTable.userId })
      .from(profilesTable)
      .where(
        and(
          eq(profilesTable.userId, recipientId),
          eq(profilesTable.verifiedSchool, school),
        ),
      )
      .limit(1),
  ]);
  if (!sender.length) {
    res.status(409).json({ error: "Complete your student profile first." });
    return;
  }
  if (!recipient.length || !(await areAcceptedFriends(userId, recipientId))) {
    res.status(404).json({ error: "Friend not found." });
    return;
  }

  const [pendingRequest] = await db
    .select({ id: activityRequestsTable.id })
    .from(activityRequestsTable)
    .where(
      and(
        eq(activityRequestsTable.mode, mode),
        eq(activityRequestsTable.status, "pending"),
        or(
          and(
            eq(activityRequestsTable.requesterId, userId),
            eq(activityRequestsTable.recipientId, recipientId),
          ),
          and(
            eq(activityRequestsTable.requesterId, recipientId),
            eq(activityRequestsTable.recipientId, userId),
          ),
        ),
      ),
    )
    .limit(1);
  if (pendingRequest) {
    res.status(409).json({ error: "There is already a pending request." });
    return;
  }

  const [created] = await db
    .insert(activityRequestsTable)
    .values({
      id: randomUUID(),
      requesterId: userId,
      recipientId,
      mode,
      status: "pending",
    })
    .returning();
  const result = await requestWithStudent(created, userId, school);
  res.status(201).json(CreateActivityRequestResponse.parse(result));
});

router.patch(
  "/activity-requests/:id",
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    const school = getVersariSchool(res);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const params = UpdateActivityRequestParams.safeParse(req.params);
    const parsed = UpdateActivityRequestBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [request] = await db
      .select()
      .from(activityRequestsTable)
      .where(
        and(
          eq(activityRequestsTable.id, params.data.id),
          eq(activityRequestsTable.recipientId, userId),
        ),
      )
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Activity request not found." });
      return;
    }
    if (request.status !== "pending") {
      res.status(409).json({ error: "This request has already been answered." });
      return;
    }
    if (!(await requestWithStudent(request, userId, school))) {
      res.status(404).json({ error: "Activity request not found." });
      return;
    }
    const [updated] = await db
      .update(activityRequestsTable)
      .set({ status: parsed.data.status })
      .where(
        and(
          eq(activityRequestsTable.id, request.id),
          eq(activityRequestsTable.recipientId, userId),
          eq(activityRequestsTable.status, "pending"),
        ),
      )
      .returning();
    if (!updated) {
      res.status(409).json({ error: "This request has already been answered." });
      return;
    }
    const result = await requestWithStudent(updated, userId, school);
    res.json(UpdateActivityRequestResponse.parse(result));
  },
);

export default router;
