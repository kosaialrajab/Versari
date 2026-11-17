import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger";
import { schoolForEmail, type VersariSchool } from "../lib/schoolAccess";

const SCHOOL_CACHE_TTL_MS = 60_000;
const schoolCache = new Map<
  string,
  { school: VersariSchool | null; expiresAt: number }
>();

export function getVersariSchool(res: {
  locals: Record<string, unknown>;
}): VersariSchool {
  return res.locals.versariSchool as VersariSchool;
}

export const requireAuth: RequestHandler = async (req, res, next): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const cached = schoolCache.get(userId);
    let school = cached && cached.expiresAt > Date.now()
      ? cached.school
      : undefined;

    if (school === undefined) {
      const user = await clerkClient.users.getUser(userId);
      const verifiedEmail = user.emailAddresses.find(
        ({ emailAddress, verification }) =>
          verification?.status === "verified" && schoolForEmail(emailAddress),
      );
      school = verifiedEmail
        ? schoolForEmail(verifiedEmail.emailAddress)
        : null;
      if (schoolCache.size >= 10_000) {
        const oldestKey = schoolCache.keys().next().value;
        if (oldestKey) schoolCache.delete(oldestKey);
      }
      schoolCache.set(userId, {
        school,
        expiresAt: Date.now() + SCHOOL_CACHE_TTL_MS,
      });
    }

    if (!school) {
      res.status(403).json({
        error: "Use a verified Carleton or uOttawa student email to access Versari.",
      });
      return;
    }

    res.locals.versariSchool = school;
    next();
  } catch (error) {
    logger.error({ err: error }, "Unable to verify Versari school email");
    res.status(503).json({
      error: "We couldn't verify your campus email. Please try again shortly.",
    });
  }
};
