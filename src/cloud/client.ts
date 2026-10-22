import { createClient } from "@supabase/supabase-js";
import type { CloudReply, CloudTransport } from "./sync";
import type { Save } from "../model";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
// Importing the menu does not create sockets, fetch data or load game assets.
export const cloudClient =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              // Best effort on tab close; large payloads use normal fetch.
              keepalive: typeof init?.body === "string" && new TextEncoder().encode(init.body).length <= 60000,
              signal: init?.signal ?? AbortSignal.timeout(20000),
            }),
        },
      })
    : null;

export async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<CloudReply> {
  if (!cloudClient) throw new Error("CLOUD_UNAVAILABLE");
  const { data, error } = await cloudClient.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export const transport: CloudTransport = {
  claim: (lease: string, initial?: Save) =>
    rpc("game_takeover", { p_lease: lease, p_character: initial?.character ?? null }),
  commit: (lease, revision, request, snapshot) =>
    rpc("game_commit", {
      p_lease: lease,
      p_revision: revision,
      p_request: request,
      p_snapshot: snapshot,
    }),
  heartbeat: (lease) => rpc("game_heartbeat", { p_lease: lease }),
  release: async (lease) => {
    await rpc("game_release", { p_lease: lease });
  },
};
