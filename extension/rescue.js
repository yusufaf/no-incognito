const RESCUABLE_PROTOCOLS = new Set(["http:", "https:", "ftp:"]);

export function isRescuableUrl(url) {
  if (typeof url !== "string") return false;
  try {
    return RESCUABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
