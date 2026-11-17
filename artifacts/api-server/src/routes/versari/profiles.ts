import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetMyProfileResponse,
  ListStudentsQueryParams,
  ListStudentsResponse,
  SaveMyProfileBody,
  SaveMyProfileResponse,
} from "@workspace/api-zod";
import { db, profilesTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { getVersariSchool, requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/me/profile", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  let [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (
    profile &&
    (profile.university !== school || profile.verifiedSchool !== school)
  ) {
    [profile] = await db
      .update(profilesTable)
      .set({
        university: school,
        verifiedSchool: school,
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.userId, userId))
      .returning();
  }
  res.json(GetMyProfileResponse.parse(profile ?? null));
});

router.put("/me/profile", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const parsed = SaveMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({
      ...parsed.data,
      userId,
      university: school,
      verifiedSchool: school,
    })
    .onConflictDoUpdate({
      target: profilesTable.userId,
      set: {
        ...parsed.data,
        university: school,
        verifiedSchool: school,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(SaveMyProfileResponse.parse(profile));
});

router.get("/students", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  const school = getVersariSchool(res);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const query = ListStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { q, mode } = query.data;
  const [myProfile] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (!myProfile) {
    res.status(409).json({ error: "Complete your student profile first." });
    return;
  }
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.verifiedSchool, school));

  const search = q?.trim().toLowerCase();
  const students = profiles
    .filter((profile) => profile.userId !== userId)
    .filter((profile) => {
      if (!mode) return true;
      return profile.lookingFor.includes(mode);
    })
    .filter((profile) => {
      if (!search) return true;
      return [
        profile.displayName,
        profile.university,
        profile.program,
        profile.bio,
        profile.studyStyle,
        profile.availability,
        ...profile.interests,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .map(({ userId: id, displayName, university, program, year, bio, interests, lookingFor, studyStyle, availability }) => ({
      userId: id,
      displayName,
      university,
      program,
      year,
      bio,
      interests,
      lookingFor,
      studyStyle,
      availability,
    }));

  res.json(ListStudentsResponse.parse(students));
});

export default router;
