import "server-only";

function asOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`,
    );
    if (!url.username && !url.password && !url.search && !url.hash)
      return url.origin;
  } catch {}
  return null;
}

/** Public origin used in email redirects and local reset links. */
export function getSiteUrl() {
  return (
    asOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    asOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    asOrigin(process.env.VERCEL_URL) ??
    "http://localhost:3000"
  );
}
