export type ActorRole = "npc" | "enemy" | "companion";
export type ActorMode = "world" | "battle";
export type AnimationDef = {
  url: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  timeline?: number[];
  fps: number;
  origin: [number, number];
  status: string;
  externalEffects?: string[];
  rigScale?: number;
};
export type EntitySummary = {
  id: string;
  slug: string;
  name: string;
  aliases?: string[];
  identity: string;
  manifestUrl?: string;
  collection?: "playable" | "review";
  reviewCategory?: string;
  variant?: string;
  organization?: { eligible: boolean; reason: string };
  hostile: boolean;
  starter?: string;
  portrait?: string;
  preview?: string;
  status: string;
  capabilities: Partial<Record<ActorRole, boolean>>;
};
export type EntityManifest = EntitySummary & {
  modes: Partial<
    Record<
      ActorMode,
      {
        animations: Record<string, AnimationDef>;
        referenceHeight: number;
        status: string;
      }
    >
  >;
  issues: unknown[];
};
