import type { Save } from "./model";
// Future authoritative economy boundary. Beta accounts/cloud snapshots are in
// cloud/; local friendly arena exists, but no ranked economy uses these contracts.
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
