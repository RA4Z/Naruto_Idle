import { openPlayerInspection } from "./inspection";
import { t,th } from "../i18n/core.ts";
import { cloudClient } from "../cloud/client";
import { getProfile,getFriends,findPlayer,friendAction,saveProfile,type SocialProfile,type SocialList } from "./api";
type Nearby = {id:string;username:string;displayName?:string};
const portraits:Record<string,string>={
  "11000101":"/assets/characters/naruto-kid/portrait.png",
  "11000211":"/assets/characters/sasuke-11000211/portrait.png",
  "11000301":"/assets/characters/sakura-kid/portrait.png",
};
let dialog:HTMLDialogElement|undefined;
let own:SocialProfile|undefined, lists:SocialList={friends:[],incoming:[],outgoing:[]};
let nearby:Nearby[]=[];
let selected:SocialProfile|undefined,tab="friends",busy=false,revision=0;
let poll:ReturnType<typeof setInterval>|undefined;
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string) {
  const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;
}
function feedback(message:string,error=false) {
  const e=dialog?.querySelector<HTMLElement>("[data-social-feedback]");
  if(e){e.textContent=message;e.dataset.error=String(error);}
}
function errorMessage(error:unknown) {
  const text=String(error instanceof Error?error.message:error);
  if(/DISPLAY_NAME_INVALID/.test(text))return t("social.caseHelp");
  if(/USERNAME_INVALID/.test(text))return t("auth.usernameHelp");
  if(/FRIEND_SELF/.test(text))return t("social.selfError");
  if(/FRIEND_LIMIT/.test(text))return t("social.limitError");
  if(/PLAYER_NOT_FOUND/.test(text))return t("social.notFound");
  if(/AUTH_REQUIRED|PROFILE_REQUIRED/.test(text))return t("auth.required");
  if(/BIO_INVALID/.test(text))return t("social.bioHelp");
  return t("social.failure");
}
function button(text:string,fn:()=>void,className="secondary") {
  const b=node("button",text,className);b.type="button";b.disabled=busy;b.onclick=fn;return b;
}
async function work(operation:()=>Promise<void>) {
  if(busy)return;
  busy=true;dialog?.setAttribute("aria-busy","true");
  dialog?.querySelectorAll<HTMLButtonElement>("button").forEach(b=>{if(!b.hasAttribute("data-social-close"))b.disabled=true;});
  feedback(t("cloud.processing"));
  try {await operation();feedback("");}
  catch(error){feedback(errorMessage(error),true);}
  finally{busy=false;dialog?.removeAttribute("aria-busy");dialog?.querySelectorAll<HTMLButtonElement>("button").forEach(b=>b.disabled=false);render();}
}
function status(p:SocialProfile) {
  return nearby.some(n=>n.id===p.user_id)?t("social.inVillage"):t("social.notInVillage");
}
function avatar(p:Pick<SocialProfile,"display_name"|"avatar_id">) {
  const image=node("img");image.src=portraits[p.avatar_id]??portraits["11000101"];
  image.alt=p.display_name;image.width=64;image.height=64;image.loading="lazy";return image;
}
function row(p:SocialProfile) {
  const r=node("article",undefined,"social-player");r.dataset.socialPlayer=p.user_id;
  r.append(avatar(p));
  const info=node("div",undefined,"social-player-info");
  info.append(button(p.display_name,()=>void work(async()=>{selected=await getProfile(p.user_id);}),"social-name"));
  info.append(node("small","@"+p.username),node("small",status(p)));
  r.append(info);
  return r;
}
async function change(p:SocialProfile,action:string) {
  await work(async()=>{
    await friendAction(p.user_id,action);
    lists=await getFriends();
    if(selected?.user_id===p.user_id)selected=await getProfile(p.user_id);
  });
}
function actions(p:SocialProfile,host:HTMLElement) {
  if(p.relationship==="self")return;
  if(p.relationship==="none")host.append(button(t("social.add"),()=>void change(p,"request")));
  if(p.relationship==="incoming"){
    host.append(button(t("social.accept"),()=>void change(p,"accept")));
    host.append(button(t("social.decline"),()=>void change(p,"decline")));
  }
  if(p.relationship==="outgoing")host.append(button(t("social.cancel"),()=>void change(p,"cancel")));
  if(p.relationship==="friends"){
    const b=button(t("social.remove"),()=>{
      const confirm=node("div",undefined,"social-confirm");
      confirm.append(node("span",t("social.confirmRemove",{name:p.display_name})),
        button(t("social.remove"),()=>void change(p,"remove")),
        button(t("social.keep"),()=>render()));
      host.replaceChildren(confirm);
    });
    host.append(b);
  }
}
function profile(p:SocialProfile,content:HTMLElement) {
  const card=node("section",undefined,"social-profile-card");card.dataset.socialProfile=p.user_id;
  const heading=node("div",undefined,"social-profile-heading");
  const title=node("div");title.append(node("h3",p.display_name),node("p","@"+p.username,"caption"));
  heading.append(avatar(p),title);card.append(heading);
  if(p.relationship!=="self")card.append(node("p",status(p),"caption"));
  if(p.bio)card.append(node("p",p.bio,"social-bio"));
  if(p.created_at){
    const since=new Date(p.created_at);
    if(Number.isFinite(since.valueOf()))card.append(node("p",t("social.memberSince",{date:since.toLocaleDateString(document.documentElement.lang||"pt-BR")}),"caption"));
  }
  if(p.relationship==="self"){
    const form=node("form");form.dataset.socialEdit="";
    const label=node("label",t("social.displayName"));const input=node("input");
    input.name="displayName";input.value=p.display_name;input.required=true;input.minLength=3;input.maxLength=20;
    input.pattern="[A-Za-z][A-Za-z0-9_]{2,19}";input.autocomplete="off";input.spellcheck=false;
    label.append(input);form.append(label,node("small",t("social.caseHelp")));
    const bioLabel=node("label",t("social.bio"));const bio=node("textarea");
    bio.name="bio";bio.maxLength=160;bio.rows=3;bio.value=p.bio;bioLabel.append(bio);form.append(bioLabel,node("small",t("social.bioHelp")));
    const avatarLabel=node("label",t("social.avatar"));const select=node("select");select.name="avatar";
    for(const[id,name]of [["11000101","Naruto"],["11000211","Sasuke"],["11000301","Sakura"]]){
      const option=node("option",name);option.value=id;option.selected=id===p.avatar_id;select.append(option);
    }
    avatarLabel.append(select);form.append(avatarLabel);
    const save=node("button",t("social.save"));save.type="submit";save.disabled=busy;form.append(save);
    form.onsubmit=e=>{e.preventDefault();void work(async()=>{
      if(input.value.trim().toLowerCase()!==p.username)throw new Error("DISPLAY_NAME_INVALID");
      selected=own=await saveProfile(input.value,bio.value,select.value);
      window.dispatchEvent(new Event("social-profile-updated"));
    });};
    card.append(form);
  }else{
    const bar=node("div",undefined,"social-actions");actions(p,bar);card.append(bar);
  }
  content.append(card);
}
function render() {
  if(!dialog?.open)return;
  dialog.querySelectorAll<HTMLButtonElement>("[data-social-tab]").forEach(b=>{
    b.disabled=busy;b.setAttribute("aria-pressed",String(!selected&&b.dataset.socialTab===tab));
    const key=b.dataset.socialTab!;
    const count=key==="friends"?lists.friends.length:key==="requests"?lists.incoming.length:nearby.length;
    b.textContent=t(key==="friends"?"social.friends":key==="requests"?"social.requests":"social.nearby")+" ("+count+")";
  });
  const content=dialog.querySelector<HTMLElement>("[data-social-content]")!;content.replaceChildren();
  if(selected){profile(selected,content);return;}
  if(tab==="nearby"){
    if(!nearby.length)content.append(node("p",t("social.emptyNearby"),"caption"));
    for(const n of nearby){
      const p:SocialProfile={user_id:n.id,username:n.username,display_name:n.displayName??n.username,bio:"",avatar_id:"11000101",created_at:"",relationship:"none"};
      const r=row(p);content.append(r);
    }
    return;
  }
  function group(title:string,players:SocialProfile[],empty:string){
    content.append(node("h3",title));
    if(!players.length)content.append(node("p",empty,"caption"));
    for(const p of players){const r=row(p);const bar=node("div",undefined,"social-actions");actions(p,bar);r.append(bar);content.append(r);}
  }
  if(tab==="requests"){
    group(t("social.received"),lists.incoming,t("social.emptyReceived"));
    group(t("social.sent"),lists.outgoing,t("social.emptySent"));
  }else group(t("social.friends"),lists.friends,t("social.emptyFriends"));
}
async function refresh() {
  const request=++revision;
  const [p,l]=await Promise.all([getProfile(),getFriends()]);
  if(request!==revision||!dialog?.open)return;
  own=p;lists=l;
  if(selected)selected=selected.user_id===own.user_id?own:await getProfile(selected.user_id);
}
function ensureDialog() {
  if(dialog)return;
  dialog=node("dialog");dialog.className="social-panel";dialog.setAttribute("aria-labelledby","social-title");
  dialog.innerHTML=`<header class="library-heading"><div><p class="eyebrow">${th("social.eyebrow")}</p><h2 id="social-title">${th("social.title")}</h2></div><button type="button" class="secondary" data-social-close>${th("social.close")}</button></header>
    <div class="social-toolbar"><button type="button" class="secondary" data-social-own>${th("social.myProfile")}</button><button type="button" class="secondary" data-social-refresh>${th("social.refresh")}</button></div>
    <form class="social-search" data-social-search><label for="social-search-name">${th("social.searchLabel")}</label><div><input id="social-search-name" name="username" required minlength="3" maxlength="20" pattern="[A-Za-z][A-Za-z0-9_]{2,19}" autocomplete="off" spellcheck="false" placeholder="${th("social.searchPlaceholder")}"><button type="submit">${th("social.search")}</button></div></form>
    <nav class="social-tabs"><button type="button" class="secondary" data-social-tab="friends"></button><button type="button" class="secondary" data-social-tab="requests"></button><button type="button" class="secondary" data-social-tab="nearby"></button></nav>
    <p data-social-feedback role="status" aria-live="polite"></p><div data-social-content></div>`;
  document.body.append(dialog);
  dialog.querySelector("[data-social-close]")!.addEventListener("click",()=>dialog!.close());
  dialog.querySelector("[data-social-own]")!.addEventListener("click",()=>void work(async()=>{selected=await getProfile();}));
  dialog.querySelector("[data-social-refresh]")!.addEventListener("click",()=>void work(refresh));
  dialog.querySelectorAll<HTMLButtonElement>("[data-social-tab]").forEach(b=>b.onclick=()=>{
    if(busy)return;selected=undefined;tab=b.dataset.socialTab!;render();
  });
  dialog.querySelector("form")!.addEventListener("submit",e=>{
    e.preventDefault();const input=dialog!.querySelector<HTMLInputElement>("#social-search-name")!;
    void work(async()=>{
      const found=await findPlayer(input.value);if(!found)throw new Error("PLAYER_NOT_FOUND");selected=found;
    });
  });
  dialog.addEventListener("close",()=>{
    ++revision;clearInterval(poll);selected=undefined;
    dialog?.querySelector<HTMLElement>("[data-social-content]")?.replaceChildren();
  });
}
export async function openSocial(userId?:string) {
  ensureDialog();
  if(!dialog!.open){selected=undefined;tab="friends";dialog!.showModal();}
  await work(async()=>{await refresh();selected=userId?await getProfile(userId):undefined;});
  clearInterval(poll);
  poll=setInterval(()=>{
    if(!busy&&dialog?.open&&!dialog.querySelector("[data-social-edit]"))void work(refresh);
  },15000);
}
window.addEventListener("village-presence",event=>{
  nearby=(event as CustomEvent<Nearby[]>).detail;
  if(dialog?.open&&!selected)render();
});
window.addEventListener("open-player-profile",event=>{
  const id=(event as CustomEvent<string>).detail;
  if(typeof id==="string")void openPlayerInspection(id);
});
cloudClient?.auth.onAuthStateChange(event=>{
  if(event==="SIGNED_OUT"){dialog?.close();own=undefined;lists={friends:[],incoming:[],outgoing:[]};nearby=[];}
});
