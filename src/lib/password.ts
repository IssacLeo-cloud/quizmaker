const ALGORITHM = "pbkdf2";
const HASH_NAME = "sha256";
const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `${ALGORITHM}$${HASH_NAME}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  payload: string,
): Promise<boolean> {
  const parts = payload.split("$");
  if (parts.length !== 5) {
    return false;
  }

  const [algorithm, hashName, iterationText, saltText, hashText] = parts;
  const iterations = Number(iterationText);
  if (
    algorithm !== ALGORITHM ||
    hashName !== HASH_NAME ||
    !Number.isInteger(iterations) ||
    iterations < 1
  ) {
    return false;
  }

  const salt = base64ToBytes(saltText);
  const expected = base64ToBytes(hashText);
  if (!salt || !expected) {
    return false;
  }

  const actual = await deriveBits(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
