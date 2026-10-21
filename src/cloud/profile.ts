import { cloudClient } from "./client";

export const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
export function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new Error("USERNAME_INVALID");
  return username;
}
export async function requireAccount() {
  if (!cloudClient) throw new Error("CLOUD_UNAVAILABLE");
  const { data, error } = await cloudClient.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  const profile = await cloudClient.from("player_profiles").select("username")
    .eq("user_id", data.user.id).maybeSingle();
  if (profile.error) throw new Error("CLOUD_UNAVAILABLE");
  if (!profile.data) throw new Error("PROFILE_REQUIRED");
  return { user: data.user, username: profile.data.username as string };
}
