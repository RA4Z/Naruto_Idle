let vision = false;
export function visionDebugEnabled() {
  return !!(import.meta.env.DEV && import.meta.env.ADMIN_CONSOLE && vision);
}
export function setVisionDebug(value: boolean) {
  if (import.meta.env.DEV && import.meta.env.ADMIN_CONSOLE) vision = value;
}
