import { t } from "../i18n/core";
import { parseDebugCommand } from "./debug-commands";
import { setVisionDebug } from "./debug-state";
import "./debug-console.css";
export function installDebugConsole() {
  if (
    !import.meta.env.DEV ||
    !import.meta.env.ADMIN_CONSOLE ||
    document.getElementById("admin-debug-console")
  )
    return;
  const dialog = document.createElement("dialog");
  dialog.id = "admin-debug-console";
  dialog.className = "admin-debug-console";
  dialog.setAttribute("aria-labelledby", "admin-debug-title");
  const title = document.createElement("h2");
  title.id = "admin-debug-title";
  title.textContent = t("stealth.consoleTitle");
  const help = document.createElement("p");
  help.textContent = t("stealth.consoleHelp");
  const log = document.createElement("div");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const form = document.createElement("form"),
    input = document.createElement("input");
  input.type = "text";
  input.setAttribute("aria-label", t("stealth.consoleCommand"));
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "debug=true";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = t("stealth.consoleRun");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = t("cloud.close");
  close.onclick = () => dialog.close();
  form.append(input, submit, close);
  dialog.append(title, help, log, form);
  document.body.append(dialog);
  form.onsubmit = (event) => {
    event.preventDefault();
    const value = parseDebugCommand(input.value),
      line = document.createElement("p");
    if (value === undefined) line.textContent = t("stealth.consoleUnknown");
    else {
      setVisionDebug(value);
      line.textContent = `debug=${value}`;
    }
    log.append(line);
    if (log.childElementCount > 30) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    input.value = "";
    input.focus();
  };
  let previous: HTMLElement | null = null;
  dialog.addEventListener("close", () => {
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.repeat ||
        !(event.key === "'" || (event.code === "Quote" && !event.shiftKey))
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        !dialog.open &&
        (target?.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || ""))
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (dialog.open) dialog.close();
      else {
        previous = document.activeElement as HTMLElement;
        dialog.showModal();
        input.focus();
      }
    },
    { capture: true },
  );
}
