const CAMPUS_BY_EMAIL_DOMAIN = {
  'cmail.carleton.ca': 'Carleton University',
  'uottawa.ca': 'University of Ottawa',
} as const;

type EmailAddress = {
  emailAddress: string;
  verification?: { status?: string | null } | null;
};

function campusForEmail(emailAddress: string) {
  const normalized = emailAddress.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator < 1 || separator === normalized.length - 1) return null;

  const domain = normalized.slice(separator + 1);
  return CAMPUS_BY_EMAIL_DOMAIN[domain as keyof typeof CAMPUS_BY_EMAIL_DOMAIN] ?? null;
}

export function campusFromVerifiedEmails(
  emailAddresses?: readonly EmailAddress[] | null,
) {
  for (const address of emailAddresses ?? []) {
    if (address.verification?.status !== 'verified') continue;
    const campus = campusForEmail(address.emailAddress);
    if (campus) return campus;
  }
  return null;
}
