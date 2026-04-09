const CLOUD_CODE_LENGTH = 6;
const LOCAL_PREFIX = "L-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeSessionCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
}

export function isLocalSessionCode(code: string): boolean {
  return normalizeSessionCode(code).startsWith(LOCAL_PREFIX);
}

export function createSessionCode(local: boolean): string {
  let code = "";
  for (let index = 0; index < CLOUD_CODE_LENGTH; index += 1) {
    const next = Math.floor(Math.random() * CODE_CHARS.length);
    code += CODE_CHARS[next];
  }

  return local ? `${LOCAL_PREFIX}${code}` : code;
}
