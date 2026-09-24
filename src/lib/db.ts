import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.quizmaker;
}

export async function getSessionSecret() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return env.SESSION_SECRET;
}
