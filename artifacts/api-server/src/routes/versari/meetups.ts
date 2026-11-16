import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, count, eq, gt, inArray, ilike, or } from "drizzle-orm";
import {
  CreateMeetupBody,
  CreateMeetupResponse,
  JoinMeetupParams,
  JoinMeetupResponse,
  LeaveMeetupParams,
  LeaveMeetupResponse,
  ListMeetupsQueryParams,
  ListMeetupsResponse,
} from "@workspace/api-zod";
import {
  db,
  meetupMembersTable,
  meetupsTable,
  profilesTable,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

async function buildMeetups(
  currentUserId: string,
  mode?: string,
  search?: string,
) {
  const now = new Date();
  const modeFilter = mode ? eq(meetupsTable.mode, mode) : undefined;
  const searchFilter = search
    ? or(
        ilike(meetupsTable.title, `%${search}%`),
        ilike(meetupsTable.topic, `%${search}%`),
        ilike(meetupsTable.description, `%${search}%`),
        ilike(meetupsTable.location, `%${search}%`),
      )
    : undefined;
  const meetups = await db
    .select({
      id: meetupsTable.id,
      creatorId: meetupsTable.creatorId,
      creatorName: profilesTable.displayName,
      mode: meetupsTable.mode,
      title: meetupsTable.title,
      topic: meetupsTable.topic,
      description: meetupsTable.description,
      location: meetupsTable.location,
      startsAt: meetupsTable.startsAt,
      capacity: meetupsTable.capacity,
    })
    .from(meetupsTable)
    .innerJoin(profilesTable, eq(meetupsTable.creatorId, profilesTable.userId))
    .where(
      and(
        gt(meetupsTable.startsAt, now),
        modeFilter,
        searchFilter,
      ),
    )
    .orderBy(asc(meetupsTable.startsAt))
    .limit(100);

  if (!meetups.length) return [];

  const meetupIds = meetups.map((meetup) => meetup.id);
  const members = await db
    .select()
    .from(meetupMembersTable)
    .where(inArray(meetupMembersTable.meetupId, meetupIds));
  const counts = new Map<string, number>();
  const joined = new Set<string>();
  for (const member of members) {
    counts.set(member.meetupId, (counts.get(member.meetupId) ?? 0) + 1);
    if (member.userId === currentUserId) joined.add(member.meetupId);
  }

  return meetups.map((meetup) => ({
    ...meetup,
    attendeeCount: counts.get(meetup.id) ?? 0,
    joined: joined.has(meetup.id),
  }));
}

router.get("/meetups", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const query = ListMeetupsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const meetups = await buildMeetups(
    userId,
    query.data.mode,
    query.data.q?.trim(),
  );
  res.json(ListMeetupsResponse.parse(meetups));
});

router.post("/meetups", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const parsed = CreateMeetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const startsAt = new Date(parsed.data.startsAt);
  if (startsAt <= new Date()) {
    res.status(400).json({ error: "Choose a meetup time in the future." });
    return;
  }
  const [profile] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (!profile) {
    res.status(409).json({ error: "Complete your student profile first." });
    return;
  }

  const meetupId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(meetupsTable).values({
      id: meetupId,
      creatorId: userId,
      ...parsed.data,
      startsAt,
    });
    await tx.insert(meetupMembersTable).values({ meetupId, userId });
  });
  const [meetup] = await buildMeetups(userId).then((items) =>
    items.filter((item) => item.id === meetupId),
  );
  if (!meetup) {
    res.status(500).json({ error: "The meetup was created but could not be loaded." });
    return;
  }
  res.status(201).json(CreateMeetupResponse.parse(meetup));
});

router.post("/meetups/:id/join", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const params = JoinMeetupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [meetup] = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.id, params.data.id))
    .limit(1);
  if (!meetup) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  const [profile] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (!profile) {
    res.status(409).json({ error: "Complete your student profile first." });
    return;
  }
  const [existing] = await db
    .select()
    .from(meetupMembersTable)
    .where(
      and(
        eq(meetupMembersTable.meetupId, meetup.id),
        eq(meetupMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!existing) {
    const [memberCount] = await db
      .select({ value: count() })
      .from(meetupMembersTable)
      .where(eq(meetupMembersTable.meetupId, meetup.id));
    if (Number(memberCount?.value ?? 0) >= meetup.capacity) {
      res.status(409).json({ error: "This meetup is full." });
      return;
    }
    await db.insert(meetupMembersTable).values({
      meetupId: meetup.id,
      userId,
    });
  }
  const [updated] = await buildMeetups(userId).then((items) =>
    items.filter((item) => item.id === meetup.id),
  );
  if (!updated) {
    res.status(404).json({ error: "Meetup is no longer available." });
    return;
  }
  res.json(JoinMeetupResponse.parse(updated));
});

router.delete("/meetups/:id/join", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const params = LeaveMeetupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [meetup] = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.id, params.data.id))
    .limit(1);
  if (!meetup) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  if (meetup.creatorId === userId) {
    res.status(409).json({ error: "The organizer cannot leave their own meetup." });
    return;
  }
  await db
    .delete(meetupMembersTable)
    .where(
      and(
        eq(meetupMembersTable.meetupId, meetup.id),
        eq(meetupMembersTable.userId, userId),
      ),
    );
  const [updated] = await buildMeetups(userId).then((items) =>
    items.filter((item) => item.id === meetup.id),
  );
  if (!updated) {
    res.status(404).json({ error: "Meetup is no longer available." });
    return;
  }
  res.json(LeaveMeetupResponse.parse(updated));
});

export default router;
