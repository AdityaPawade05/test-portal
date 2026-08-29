export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function getAppBaseUrl(origin?: string): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  if (origin && origin.trim()) {
    return origin.trim().replace(/\/+$/, "");
  }
  return "http://localhost:3000";
}

