// Voice packages identified in the original sound configuration for the starters.
// New packages can declare voice:true instead of extending this legacy adapter.
const STARTER_VOICE_IDS = new Set(["271", "272", "289", "291", "296", "297"]);
export function isVoiceSound(id: string, metadata?: { voice?: boolean }) {
  return metadata?.voice ?? STARTER_VOICE_IDS.has(id);
}
