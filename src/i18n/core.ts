import portuguese from "./locales/pt-BR.json" with { type: "json" };
import english from "./locales/en.json" with { type: "json" };
import spanish from "./locales/es.json" with { type: "json" };
import originalMessages from "./sources.json" with { type: "json" };

export const LOCALES = {
  "pt-BR": "Português",
  en: "English",
  es: "Español",
} as const;
export type Locale = keyof typeof LOCALES;
export type MessageKey = keyof typeof portuguese;
type Message = string | ({ other: string } & Record<string, string>);
const catalogs: Record<Locale, Record<string, Message>> = {
  "pt-BR": portuguese,
  en: english,
  es: spanish,
};
export const LANGUAGE_STORAGE_KEY = "folha-idle-language";
let locale: Locale = "pt-BR";
try {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && Object.hasOwn(LOCALES, saved)) locale = saved as Locale;
  }
} catch {
  /* Browsers may deny storage; the game still works in Portuguese. */
}
export const getLocale = () => locale;
const numberFormatters = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<Locale, Intl.PluralRules>();
export function setLocale(value: Locale) {
  if (!Object.hasOwn(LOCALES, value)) throw new Error("Unsupported locale");
  locale = value;
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
  } catch {
    /* Session-only language. */
  }
}
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  const key = locale + JSON.stringify(options ?? {});
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    if (numberFormatters.size >= 32) numberFormatters.clear();
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}
export function t(
  key: MessageKey,
  params: Record<string, unknown> = {},
): string {
  let value = catalogs[locale][key] ?? catalogs["pt-BR"][key] ?? key;
  if (typeof value !== "string") {
    if (!pluralRules.has(locale))
      pluralRules.set(locale, new Intl.PluralRules(locale));
    value =
      value[pluralRules.get(locale)!.select(Number(params.count))] ??
      value.other;
  }
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined
      ? match
      : typeof params[name] === "number"
        ? formatNumber(params[name])
        : String(params[name]),
  );
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
// Only plain text lives in catalogs. Escape the result when inserted into HTML.
export const th = (key: MessageKey, params?: Record<string, unknown>) =>
  escapeHtml(t(key, params));

const sourceKeys = new Map<string, MessageKey>(
  Object.entries(originalMessages).map(([source, key]) => [
    source,
    key as MessageKey,
  ]),
);
// Boundary adapter for original content and legacy API messages. Canonical
// names, server state, search aliases, IDs and saves remain language independent.
export function translateText(value: string): string {
  const key = sourceKeys.get(value);
  return key ? t(key) : value;
}
let externalPatterns:
  | { key: MessageKey; names: string[]; pattern: RegExp }[]
  | undefined;
export function translateExternalMessage(value: string): string {
  const exact = sourceKeys.get(value);
  if (exact) return t(exact);
  externalPatterns ??= Object.entries(originalMessages)
    .filter(
      ([text, key]) =>
        key.startsWith("server.") &&
        typeof text === "string" &&
        /\{v\d+\}/.test(text),
    )
    .map(([text, key]) => {
      const names: string[] = [];
      const pattern = String(text)
        .split(/(\{v\d+\})/g)
        .map((part) => {
          if (/^\{v\d+\}$/.test(part)) {
            names.push(part.slice(1, -1));
            return "(.*?)";
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      return {
        key: key as MessageKey,
        names,
        pattern: new RegExp("^" + pattern + "$", "u"),
      };
    });
  for (const { key, pattern, names } of externalPatterns) {
    const match = value.match(pattern);
    if (match)
      return t(
        key,
        Object.fromEntries(
          names.map((name, i) => [name, translateText(match[i + 1])]),
        ),
      );
  }
  return value;
}
export function errorText(error: unknown) {
  return translateExternalMessage(
    error instanceof Error ? error.message : String(error),
  );
}
export function localizeContent<T>(value: T): T {
  if (Array.isArray(value))
    return value.map((item) => localizeContent(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["name", "description", "variant", "skill", "reason"].includes(key) &&
      typeof item === "string"
        ? translateText(item)
        : localizeContent(item),
    ]),
  ) as T;
}
export function phaseText(value: string) {
  return translateText(value);
}
export function statusText(value: string) {
  const keys: Record<string, MessageKey> = {
    ready: "state.ready",
    partial: "state.partial",
    pending: "state.pending",
    approved: "state.approved",
    rejected: "state.rejected",
    "portrait-only": "state.portrait",
    "temporary-fallback": "state.temporary",
    world: "state.world",
    battle: "state.battle",
    waiting: "state.waiting",
    active: "state.active",
    finished: "state.finished",
    weapon: "state.weapon",
    armor: "state.armor",
    charm: "state.charm",
  };
  return keys[value] ? t(keys[value]) : value;
}
