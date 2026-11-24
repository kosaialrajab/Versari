import { createSign, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, count, eq, gt, inArray, ilike, or } from "drizzle-orm";
import {
  CancelMeetupParams,
  CreateMeetupCallTokenParams,
  CreateMeetupCallTokenResponse,
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
import {
  areAcceptedFriends,
  getVerifiedFriendIds,
} from "../../lib/friendAccess";
import { getVersariSchool, requireAuth } from "../../middlewares/requireAuth";
import type { VersariSchool } from "../../lib/schoolAccess";

const router: IRouter = Router();
router.use(requireAuth);

async function buildMeetups(
  currentUserId: string,
  school: VersariSchool,
  mode?: string,
  search?: string,
) {
  const now = new Date();
  const visibleCreatorIds = [
    currentUserId,
    ...(await getVerifiedFriendIds(currentUserId, school)),
  ];
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
      isOnline: meetupsTable.isOnline,
      startsAt: meetupsTable.startsAt,
      capacity: meetupsTable.capacity,
    })
    .from(meetupsTable)
    .innerJoin(profilesTable, eq(meetupsTable.creatorId, profilesTable.userId))
    .where(
      and(
        gt(meetupsTable.startsAt, now),
        eq(profilesTable.verifiedSchool, school),
        inArray(meetupsTable.creatorId, visibleCreatorIds),
        modeFilter,
        searchFilter,
      ),
    )
    .orderBy(asc(meetupsTable.startsAt))
    .limit(100);

  if (!meetups.length) return [];

  const meetupIds = meetups.map((meetup) => meetup.id);
  const members = await db
    .select({
      meetupId: meetupMembersTable.meetupId,
      userId: meetupMembersTable.userId,
    })
    .from(meetupMembersTable)
    .innerJoin(profilesTable, eq(meetupMembersTable.userId, profilesTable.userId))
    .where(
      and(
        inArray(meetupMembersTable.meetupId, meetupIds),
        eq(profilesTable.verifiedSchool, school),
      ),
    );
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
  const school = getVersariSchool(res);
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
    school,
    query.data.mode,
    query.data.q?.trim(),
  );
  res.json(ListMeetupsResponse.parse(meetups));
});

router.post("/meetups/:id/call-token", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const params = CreateMeetupCallTokenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [participant] = await db
    .select({
      id: meetupsTable.id,
      creatorId: meetupsTable.creatorId,
      title: meetupsTable.title,
      mode: meetupsTable.mode,
      isOnline: meetupsTable.isOnline,
      displayName: profilesTable.displayName,
    })
    .from(meetupsTable)
    .innerJoin(
      profilesTable,
      and(
        eq(meetupsTable.creatorId, profilesTable.userId),
        eq(profilesTable.verifiedSchool, school),
      ),
    )
    .innerJoin(
      meetupMembersTable,
      and(
        eq(meetupMembersTable.meetupId, meetupsTable.id),
        eq(meetupMembersTable.userId, userId),
      ),
    )
    .where(eq(meetupsTable.id, params.data.id))
    .limit(1);

  if (!participant) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  if (
    participant.creatorId !== userId &&
    !(await areAcceptedFriends(userId, participant.creatorId))
  ) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  if (!participant.isOnline) {
    res.status(409).json({ error: "This meetup does not have an online call." });
    return;
  }

  const appId = process.env.JAAS_APP_ID?.trim();
  const apiKeyId = process.env.JAAS_API_KEY_ID?.trim();
  const privateKey = process.env.JAAS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !apiKeyId || !privateKey) {
    res.status(503).json({ error: "Online calling is not configured yet." });
    return;
  }

  const roomName = `meetup-${participant.id.replaceAll("-", "")}`;
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({
      alg: "RS256",
      kid: `${appId}/${apiKeyId}`,
      typ: "JWT",
    }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      aud: "jitsi",
      iss: "chat",
      sub: appId,
      room: roomName,
      exp: issuedAt + 2 * 60 * 60,
      nbf: issuedAt - 10,
      context: {
        user: {
          id: userId,
          name: participant.displayName,
          ...(participant.creatorId === userId ? { moderator: "true" } : {}),
        },
        features: {
          recording: false,
          livestreaming: false,
          transcription: false,
        },
      },
    }),
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey).toString("base64url");
    const token = `${signingInput}.${signature}`;
    res.setHeader("Cache-Control", "no-store");
    res.json(
      CreateMeetupCallTokenResponse.parse({
        appId,
        roomName,
        token,
        title: participant.title,
        mode: participant.mode,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to sign JaaS meeting token");
    res.status(503).json({ error: "Online calling is temporarily unavailable." });
  }
});

router.post("/meetups", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
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
  await db
    .update(profilesTable)
    .set({
      university: school,
      verifiedSchool: school,
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.userId, userId));

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
  const [meetup] = await buildMeetups(userId, school).then((items) =>
    items.filter((item) => item.id === meetupId),
  );
  if (!meetup) {
    res.status(500).json({ error: "The meetup was created but could not be loaded." });
    return;
  }
  res.status(201).json(CreateMeetupResponse.parse(meetup));
});

router.delete("/meetups/:id", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const params = CancelMeetupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meetup] = await db
    .select({ creatorId: meetupsTable.creatorId })
    .from(meetupsTable)
    .innerJoin(profilesTable, eq(meetupsTable.creatorId, profilesTable.userId))
    .where(
      and(
        eq(meetupsTable.id, params.data.id),
        eq(profilesTable.verifiedSchool, school),
      ),
    )
    .limit(1);
  if (!meetup) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  if (meetup.creatorId !== userId) {
    res.status(403).json({ error: "Only the organizer can cancel this meetup." });
    return;
  }

  const [deleted] = await db
    .delete(meetupsTable)
    .where(
      and(
        eq(meetupsTable.id, params.data.id),
        eq(meetupsTable.creatorId, userId),
      ),
    )
    .returning({ id: meetupsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  res.status(204).end();
});

router.post("/meetups/:id/join", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
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
    .select({
      id: meetupsTable.id,
      creatorId: meetupsTable.creatorId,
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
        eq(meetupsTable.id, params.data.id),
        eq(profilesTable.verifiedSchool, school),
      ),
    )
    .limit(1);
  if (!meetup) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  if (
    meetup.creatorId !== userId &&
    !(await areAcceptedFriends(userId, meetup.creatorId))
  ) {
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
  await db
    .update(profilesTable)
    .set({
      university: school,
      verifiedSchool: school,
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.userId, userId));
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
      .innerJoin(profilesTable, eq(meetupMembersTable.userId, profilesTable.userId))
      .where(
        and(
          eq(meetupMembersTable.meetupId, meetup.id),
          eq(profilesTable.verifiedSchool, school),
        ),
      );
    if (Number(memberCount?.value ?? 0) >= meetup.capacity) {
      res.status(409).json({ error: "This meetup is full." });
      return;
    }
    await db.insert(meetupMembersTable).values({
      meetupId: meetup.id,
      userId,
    });
  }
  const [updated] = await buildMeetups(userId, school).then((items) =>
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
  const school = getVersariSchool(res);
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
    .select({
      id: meetupsTable.id,
      creatorId: meetupsTable.creatorId,
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
        eq(meetupsTable.id, params.data.id),
        eq(profilesTable.verifiedSchool, school),
      ),
    )
    .limit(1);
  if (!meetup) {
    res.status(404).json({ error: "Meetup not found." });
    return;
  }
  if (
    meetup.creatorId !== userId &&
    !(await areAcceptedFriends(userId, meetup.creatorId))
  ) {
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
  const [updated] = await buildMeetups(userId, school).then((items) =>
    items.filter((item) => item.id === meetup.id),
  );
  if (!updated) {
    res.status(404).json({ error: "Meetup is no longer available." });
    return;
  }
  res.json(LeaveMeetupResponse.parse(updated));
});

export default router;
