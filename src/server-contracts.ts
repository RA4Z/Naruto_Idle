import type { Save } from "./model";
// Future server boundary only. No accounts, backend, ranking or multiplayer exist yet.
export interface AccountSession {
  accountId: string;
  expiresAt: number;
}
export interface SessionClaim {
  sessionId: string;
  areaId: string;
  durationSeconds: number;
  idempotencyKey: string;
}
export interface AuthoritativeProgressGateway {
  loadProgress(session: AccountSession): Promise<Save>;
  claimHunt(
    session: AccountSession,
    claim: SessionClaim,
  ): Promise<{ progress: Save; receiptId: string }>;
  leaderboard(
    session: AccountSession,
  ): Promise<Array<{ displayName: string; level: number }>>;
}
