import { getSessionSecret } from "@/lib/db";

export const SESSION_COOKIE_NAME = "quizmaker_session";
const SESSION_MAX_AGE_SECONDS = 604_800;
const COOKIE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (padded.length % 4)) % 4;
    const binary = atob(`${padded}${"=".repeat(padLength)}`);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function cookieHeader(value: string, maxAge: number): string {
  return `${SESSION_COOKIE_NAME}=${value}; ${COOKIE_ATTRS}; Max-Age=${maxAge}`;
}

function readNamedCookie(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator);
    if (key === name) {
      return decodeURIComponent(trimmed.slice(separator + 1));
    }
  }

  return null;
}

async function userIdFromSessionValue(
  value: string | null,
): Promise<string | null> {
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [userId, expiresAtRaw, signature] = parts;
  if (!userId || !expiresAtRaw || !signature) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const expected = await signPayload(
    await getSessionSecret(),
    `${userId}.${expiresAtRaw}`,
  );
  const actualBytes = base64UrlToBytes(signature);
  const expectedBytes = base64UrlToBytes(expected);
  if (!actualBytes || !expectedBytes) {
    return null;
  }

  if (!timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  return userId;
}

export async function createSessionCookie(userId: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = await signPayload(await getSessionSecret(), payload);
  return cookieHeader(`${payload}.${signature}`, SESSION_MAX_AGE_SECONDS);
}

export function clearedSessionCookie(): string {
  return cookieHeader("", 0);
}

export async function getSessionUserIdFromCookieHeader(
  header: string | null | undefined,
): Promise<string | null> {
  return userIdFromSessionValue(readNamedCookie(header, SESSION_COOKIE_NAME));
}

export async function getSessionUserId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return userIdFromSessionValue(jar.get(SESSION_COOKIE_NAME)?.value ?? null);
}
