export interface VillageState {
  x: number; y: number; characterId: string; direction: number; moving: boolean; updatedAt?: number;
}
export interface VillagePlayer { id: string; username: string; state?: VillageState }
export type VillageStatus = "disabled" | "connecting" | "online" | "reconnecting" | "unavailable";
interface Options {
  url: string;
  token: () => Promise<string | undefined>;
  players: (players: VillagePlayer[]) => void;
  status: (status: VillageStatus) => void;
  socket?: (url: string) => WebSocket;
}
export function multiplayerUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return;
    if (url.pathname === "/") url.pathname = "/ws";
    if (url.pathname !== "/ws") return;
    return url.href;
  } catch { return; }
}
function player(value: any): value is VillagePlayer {
  const s = value?.state;
  return typeof value?.id === "string" && value.id.length <= 64 &&
    typeof value.username === "string" && /^[a-z][a-z0-9_]{2,19}$/.test(value.username) &&
    (!s || (typeof s.characterId === "string" && /^[0-9]{8}$/.test(s.characterId) &&
      Number.isFinite(s.x) && Number.isFinite(s.y) && s.x>=0 && s.x<=1000 && s.y>=0 && s.y<=1000 &&
      Number.isInteger(s.direction) && s.direction>=0 && s.direction<=7 && typeof s.moving === "boolean"));
}
export class VillageClient {
  private ws?: WebSocket;
  private generation = 0;
  private enabled = false;
  private disposed = false;
  private ready = false;
  private selfId?: string;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private blocked = false;
  private latest?: VillageState;
  private members = new Map<string, VillagePlayer>();
  constructor(private options: Options) {}
  setMap(mapId: string) {
    const enabled = mapId === "10001";
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled; this.blocked = false;
    this.disconnect();
    if (enabled) void this.connect();
    else this.options.status("disabled");
  }
  publish(state: VillageState) {
    this.latest = state;
    if (this.ready) this.send({type:"state",state});
  }
  refresh() {
    if (this.disposed || !this.enabled) return;
    this.blocked = false;
    if (this.ws?.readyState === 1) {
      const ws = this.ws;
      void this.options.token().then(token => {
        if (token && this.ws === ws && ws.readyState === 1) this.send({type:"auth",accessToken:token});
      }).catch(() => {});
    } else { this.disconnect(); void this.connect(); }
  }
  private send(message: unknown) {
    if (this.ws?.readyState === 1 && this.ws.bufferedAmount < 16384)
      this.ws.send(JSON.stringify(message));
  }
  private emit() { this.options.players([...this.members.values()]); }
  private async connect() {
    if (this.disposed || !this.enabled || this.blocked) return;
    const generation = ++this.generation;
    this.options.status(this.attempt ? "reconnecting" : "connecting");
    let token: string | undefined;
    try { token = await this.options.token(); } catch {}
    if (generation !== this.generation || this.disposed || !this.enabled) return;
    if (!token) { this.options.status("unavailable"); this.schedule(); return; }
    let ws: WebSocket;
    try { ws = (this.options.socket ?? (url => new WebSocket(url)))(this.options.url); }
    catch { this.options.status("unavailable"); this.schedule(); return; }
    this.ws = ws;
    // Includes cold starts and authentication; reconnect rather than hanging forever.
    this.watchdog = setTimeout(() => {
      if (this.ws === ws && !this.ready) { ws.close(); }
    }, 20000);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.send({type:"auth",accessToken:token});
      token = undefined;
    };
    ws.onmessage = event => {
      if (this.ws !== ws || this.disposed || !this.enabled) return;
      let msg: any;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.type === "authenticated" && player(msg.player)) {
        this.selfId = msg.player.id;
        if (!this.ready) this.send({type:"join_map",mapId:"10001"});
      } else if (msg.type === "map_state" && msg.mapId === "10001" && Array.isArray(msg.players)) {
        this.members.clear();
        for (const p of msg.players.slice(0,100)) if (player(p) && p.id !== this.selfId) this.members.set(p.id,p);
        this.ready = true; this.attempt = 0; clearTimeout(this.watchdog);
        this.options.status("online"); this.emit();
        if (this.latest) this.send({type:"state",state:this.latest});
      } else if (["player_joined","player_state"].includes(msg.type) && msg.mapId === "10001" && this.ready) {
        if (player(msg.player) && msg.player.id !== this.selfId) {
          this.members.set(msg.player.id,msg.player); this.emit();
        }
      } else if (msg.type === "player_left" && msg.mapId === "10001") {
        this.members.delete(msg.playerId); this.emit();
      } else if (msg.type === "error") {
        if (["AUTH_REQUIRED","AUTH_TIMEOUT","SESSION_EXPIRED","PROFILE_REQUIRED","ALREADY_CONNECTED","ROOM_FULL","MAP_UNAVAILABLE"].includes(msg.code)) {
          this.blocked = true; this.options.status("unavailable"); ws.close();
        }
      }
    };
    ws.onerror = () => {}; // onclose handles retry; never log frames or credentials.
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = undefined; this.ready = false; clearTimeout(this.watchdog);
      this.members.clear(); this.emit();
      if (!this.disposed && this.enabled) {
        this.options.status(this.blocked ? "unavailable" : "reconnecting");
        this.schedule();
      }
    };
  }
  private schedule() {
    clearTimeout(this.retry);
    if (this.disposed || !this.enabled || this.blocked) return;
    const delay = Math.min(15000,1000 * 2 ** Math.min(this.attempt++,4));
    this.retry = setTimeout(() => void this.connect(), delay + Math.random()*300);
  }
  private disconnect() {
    ++this.generation; clearTimeout(this.retry); clearTimeout(this.watchdog);
    const ws = this.ws; this.ws = undefined;
    if (ws && ws.readyState < 2) ws.close();
    this.ready = false; this.members.clear(); this.latest = undefined; this.emit();
  }
  dispose() {
    this.disposed = true; this.enabled = false; this.disconnect();
  }
}
