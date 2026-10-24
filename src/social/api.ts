import { cloudClient } from "../cloud/client";
export interface SocialProfile {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_id: string;
  created_at: string;
  relationship: "self" | "none" | "incoming" | "outgoing" | "friends";
}
export interface SocialList {
  friends: SocialProfile[];
  incoming: SocialProfile[];
  outgoing: SocialProfile[];
}
export async function socialRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!cloudClient) throw new Error("CLOUD_UNAVAILABLE");
  const { data, error } = await cloudClient.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const getProfile = (id?: string) =>
  socialRpc<SocialProfile>("social_profile", { p_user: id ?? null });
export const getFriends = () => socialRpc<SocialList>("social_list");
export const findPlayer = (username: string) =>
  socialRpc<SocialProfile | null>("social_search", {
    p_username: username.trim(),
  });
export const friendAction = (id: string, action: string) =>
  socialRpc<string>("social_friend_action", { p_target: id, p_action: action });
export const saveProfile = (
  display_name: string,
  bio: string,
  avatar_id: string,
) =>
  socialRpc<SocialProfile>("social_update_profile", {
    p_display_name: display_name.trim(),
    p_bio: bio,
    p_avatar_id: avatar_id,
  });

export interface PlayerInspection {
  profile: SocialProfile;
  character: {
    id: string;
    level: number;
    upgrades: number;
    equipment: Partial<Record<import("../progression/rules").Slot, string>>;
  } | null;
}
export const getInspection = (id: string) =>
  socialRpc<PlayerInspection>("social_inspect_player", { p_user: id });
