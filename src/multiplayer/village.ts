import type Phaser from "phaser";
import { PlayerHover } from "./player-hover";
import { cloudClient } from "../cloud/client";
import { EntityActor, type ActorAssetCache } from "../entities/actor";
import { entityCatalog } from "../entities/catalog";
import { t } from "../i18n/core.ts";
import { VillageClient, multiplayerUrl, type VillagePlayer, type VillageStatus, type VillageState } from "./client";
interface Remote { player: VillagePlayer; actor?: EntityActor; hover?: PlayerHover; loading?: boolean; receivedAt: number }
export class VillagePlayers {
  private client?: VillageClient;
  private remotes = new Map<string, Remote>();
  private status: VillageStatus = "disabled";
  private badge: HTMLElement;
  private subscription?: { unsubscribe(): void };
  private disposed = false;
  private mapId = "";
  private sentAt = 0;
  private last?: VillageState;
  private presenceKey = "";
  private profileUpdated = () => this.client?.refresh();
  constructor(private scene: Phaser.Scene, private cache: ActorAssetCache, host: HTMLElement) {
    this.badge = document.createElement("span");
    this.badge.className = "multiplayer-status";
    this.badge.dataset.multiplayerStatus = "";
    this.badge.setAttribute("role","status");
    this.badge.setAttribute("aria-live","polite");
    (host.querySelector(".minimap-online")??host).append(this.badge);
    const url = multiplayerUrl(import.meta.env.VITE_MULTIPLAYER_URL);
    if (url && cloudClient && (location.protocol !== "https:" || url.startsWith("wss:"))) {
      this.client = new VillageClient({
        url,
        token: async () => (await cloudClient!.auth.getSession()).data.session?.access_token,
        players: players => this.sync(players),
        status: status => { this.status = status; this.renderStatus(); },
      });
      this.subscription = cloudClient.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") this.client?.setMap("");
        else if (event === "TOKEN_REFRESHED") this.client?.refresh();
      }).data.subscription;
    }
    window.addEventListener("social-profile-updated",this.profileUpdated);
    this.renderStatus();
  }
  activeIds() { return [...this.remotes.values()].map(r => r.player.state?.characterId).filter((id): id is string => !!id); }
  snapshot() {
    return { status:this.status, players:[...this.remotes.values()].map(r => ({
      id:r.player.id,username:r.player.username,displayName:r.player.displayName,characterId:r.player.state?.characterId,
      x:r.actor?.x,y:r.actor?.y,visible:!!r.actor?.visible,hovered:r.hover?.visible??false,animation:r.actor?.visual.anims.currentAnim?.key,
    })) };
  }
  setMap(mapId: string) {
    if (this.mapId === mapId || this.disposed) return;
    this.mapId = mapId; this.last = undefined; this.sentAt = 0;
    this.sync([]); this.client?.setMap(mapId); this.renderStatus();
  }
  private renderStatus() {
    this.badge.hidden = false;
    const key = !this.client ? "hud.offline" : this.status==="connecting" ? "hud.connecting" : this.status==="reconnecting" ? "hud.reconnecting" : "hud.unavailable";
    this.badge.textContent = this.mapId!=="10001"?t("hud.solo"):this.status==="online"?t("hud.online",{count:this.remotes.size+1}):t(key);
    this.badge.dataset.state = this.status;
  }
  private sync(players: VillagePlayer[]) {
    if (this.disposed) return;
    const ids = new Set(players.map(p => p.id));
    for (const [id,r] of this.remotes) if (!ids.has(id)) { r.actor?.destroy(); this.remotes.delete(id); }
    for (const p of players) {
      let r = this.remotes.get(p.id);
      if (!r) { r = { player:p,receivedAt:performance.now() }; this.remotes.set(p.id,r); }
      // Other players' join/leave events must not refresh this player's movement timestamp.
      if (r.player !== p) { r.receivedAt = performance.now(); r.player = p; }
      if (p.state && r.actor?.manifest.id !== p.state.characterId) {
        r.actor?.destroy(); r.actor = undefined;
        if (!r.loading) void this.load(r);
      }
    }
    const presence=[...this.remotes.values()].map(r=>({id:r.player.id,username:r.player.username,displayName:r.player.displayName}));
    const key=JSON.stringify(presence);
    if(key!==this.presenceKey){this.presenceKey=key;window.dispatchEvent(new CustomEvent("village-presence",{detail:presence}));}
    for(const r of this.remotes.values())r.actor?.setCombatLabel(r.player.displayName??r.player.username,false);
    this.renderStatus();
  }
  private async load(remote: Remote) {
    const id = remote.player.state?.characterId;
    if (!id) return;
    remote.loading = true;
    try {
      const manifest = await entityCatalog.get(id);
      if (manifest.collection !== "playable" || !manifest.capabilities.companion) return;
      await this.cache.load(manifest,"companion");
      if (this.disposed || this.mapId !== "10001" || this.remotes.get(remote.player.id) !== remote || remote.player.state?.characterId !== id) return;
      const s = remote.player.state;
      remote.actor = new EntityActor(this.scene,s.x,s.y,manifest,"companion");
      remote.actor.setCombatLabel(remote.player.displayName??remote.player.username,false);
      remote.hover = new PlayerHover(remote.actor);
      remote.actor.visual.on("pointerdown",(_pointer:unknown,_x:number,_y:number,event:{stopPropagation():void})=>{
        event.stopPropagation();
        remote.hover?.set(false);
        if(!document.querySelector("dialog[open]"))window.dispatchEvent(new CustomEvent("open-player-profile",{detail:remote.player.id}));
      });
      remote.actor.visual.setAlpha(0.95);
    } catch { /* Retried by a later presence update after transient asset failure. */ }
    finally { remote.loading = false; }
  }
  update(delta: number, state: VillageState) {
    if (this.disposed || this.mapId !== "10001") return;
    const now = performance.now();
    const changed = !this.last || Math.hypot(this.last.x-state.x,this.last.y-state.y)>0.1 ||
      this.last.direction!==state.direction || this.last.moving!==state.moving || this.last.characterId!==state.characterId;
    if ((changed && now-this.sentAt>=100) || now-this.sentAt>=1000) {
      this.sentAt = now; this.last = {...state}; this.client?.publish(state);
    }
    for (const r of this.remotes.values()) {
      const s=r.player.state,a=r.actor;
      if (!s || !a) continue;
      const distance=Math.hypot(s.x-a.x,s.y-a.y);
      if (distance>100) a.setPosition(s.x,s.y);
      else {
        const blend=1-Math.exp(-Math.min(delta,100)/65);
        a.setPosition(a.x+(s.x-a.x)*blend,a.y+(s.y-a.y)*blend);
      }
      a.play("world",(s.moving && now-r.receivedAt<500 ? "run_" : "idle_")+s.direction);
      a.tick(false);
      r.hover?.update();
    }
  }
  destroy() {
    if (this.disposed) return;
    this.client?.dispose(); this.subscription?.unsubscribe();
    window.removeEventListener("social-profile-updated",this.profileUpdated);
    this.sync([]); this.disposed = true; this.badge.remove();
  }
}
