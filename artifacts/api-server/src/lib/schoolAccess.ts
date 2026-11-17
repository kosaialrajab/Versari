export const SCHOOL_BY_EMAIL_DOMAIN = {
  "cmail.carleton.ca": "Carleton University",
  "uottawa.ca": "University of Ottawa",
} as const;

export type VersariSchool =
  (typeof SCHOOL_BY_EMAIL_DOMAIN)[keyof typeof SCHOOL_BY_EMAIL_DOMAIN];

export function schoolForEmail(emailAddress: string): VersariSchool | null {
  const normalized = emailAddress.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator < 1 || separator === normalized.length - 1) return null;

  const domain = normalized.slice(separator + 1);
  return SCHOOL_BY_EMAIL_DOMAIN[domain as keyof typeof SCHOOL_BY_EMAIL_DOMAIN] ?? null;
}
