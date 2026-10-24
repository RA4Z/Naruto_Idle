import "../../src/admin/admin.css";
import { mountSourceExportBrowser } from "../../src/admin/source-review";
import { mountNativeEffectReview } from "../../src/effects/native-review";
const index = await (await fetch("/assets/effects/native/index.json")).json();
mountSourceExportBrowser(document.querySelector("#catalog")!, index.sourceExports, entry => {
  const dialog=document.createElement("dialog"),close=document.createElement("button");
  close.textContent="Fechar";close.onclick=()=>dialog.close();dialog.style.width="min(1000px,90vw)";dialog.append(close);document.body.append(dialog);
  const dispose=mountNativeEffectReview(dialog,entry);dialog.addEventListener("close",()=>{dispose();dialog.remove();},{once:true});dialog.showModal();
});
