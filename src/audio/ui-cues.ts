export type UiCue = "click" | "close" | "battleStart" | "levelUp" | "victory" | "defeat";
// Use semantic attributes/IDs; never infer button meaning from translated text.
export function buttonCue(button: Pick<HTMLButtonElement, "id" | "disabled" | "hasAttribute">): UiCue | undefined {
  if (button.disabled) return undefined;
  return button.hasAttribute("data-close") || button.id === "back" || button.id === "return-lobby"
    ? "close" : "click";
}
