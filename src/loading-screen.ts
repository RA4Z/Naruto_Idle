import { t } from "./i18n/core.ts";
import { LOADING_ART_URLS } from "./config/loading-art";
const overlay = document.getElementById("game-loading")!;
const title = document.getElementById("loading-title")!;
const message = document.getElementById("loading-message")!;
const progress = document.getElementById(
  "loading-progress",
) as HTMLProgressElement;
const retry = document.getElementById("loading-retry") as HTMLButtonElement;
const cancel = document.getElementById("loading-cancel") as HTMLButtonElement;
let version = 0;
let artworkCycle = 0;
export const loadingScreen = {
  begin(
    label: string,
    onRetry: () => void = () => location.reload(),
    onCancel?: () => void,
  ) {
    const request = ++version;
    if (overlay.hidden) artworkCycle++;
    const artwork = LOADING_ART_URLS[artworkCycle % LOADING_ART_URLS.length];
    overlay.style.setProperty("--loading-art", `url("${artwork}")`);
    overlay.hidden = false;
    document.getElementById("app")!.inert = true;
    overlay.setAttribute("aria-busy", "true");
    title.textContent = label;
    message.textContent = t("loading-screen.b196d543af");
    progress.removeAttribute("value");
    retry.hidden = true;
    cancel.hidden = !onCancel;
    retry.onclick = onRetry;
    cancel.onclick = onCancel || null;
    return {
      update(label: string, fraction?: number) {
        if (request !== version) return;
        message.textContent = label;
        if (fraction === undefined) progress.removeAttribute("value");
        else progress.value = Math.max(0, Math.min(1, fraction));
      },
      fail(reason: unknown) {
        if (request !== version) return;
        overlay.setAttribute("aria-busy", "false");
        title.textContent = t("loading-screen.19aa45bd62");
        message.textContent =
          reason instanceof DOMException || reason instanceof TypeError
            ? t("loading-screen.4229eaefd3")
            : reason instanceof Error
              ? reason.message
              : t("loading-screen.ec3fe65bf4");
        progress.value = 0;
        retry.hidden = false;
      },
      finish() {
        if (request === version) loadingScreen.hide();
      },
    };
  },
  hide() {
    version++;
    overlay.hidden = true;
    document.getElementById("app")!.inert = false;
  },
};
