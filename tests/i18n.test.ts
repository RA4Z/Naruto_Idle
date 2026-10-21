import test from "node:test";
import assert from "node:assert/strict";
import portuguese from "../src/i18n/locales/pt-BR.json" with { type: "json" };
import sourceMessages from "../src/i18n/sources.json" with { type: "json" };
import {
  t,
  th,
  getLocale,
  setLocale,
  translateText,
  translateExternalMessage,
  localizeContent,
  formatNumber,
  type MessageKey,
} from "../src/i18n/core.ts";

test("three languages interpolate, pluralize, format and safely escape text", () => {
  try {
    for (const [locale, word, plural] of [
      ["pt-BR", "Idioma", "2 personagens"],
      ["en", "Language", "2 characters"],
      ["es", "Idioma", "2 personajes"],
    ] as const) {
      setLocale(locale);
      assert.equal(getLocale(), locale);
      assert.equal(t("common.language"), word);
      assert.equal(t("common.characters", { count: 2 }), plural);
      assert.ok(!t("common.characters", { count: 1 }).includes("{count}"));
      assert.equal(
        th("arena.log", {
          name: '<script>"&',
          action: "x",
          damage: "",
          heal: "",
        }),
        "&lt;script&gt;&quot;&amp;: x",
      );
    }
    setLocale("en");
    assert.equal(formatNumber(12.5), "12.5");
    setLocale("es");
    assert.equal(formatNumber(12.5), "12,5");
    assert.equal(t("missing.key" as MessageKey), "missing.key");
  } finally {
    setLocale("pt-BR");
  }
});

test("original content and API errors localize without changing IDs, source data or player notes", () => {
  try {
    const original = {
      id: "10001",
      name: "Vila da Folha",
      description: "Área segura · encontre moradores e prepare sua jornada.",
      notes: "Vila da Folha",
      url: "/assets/maps/10001/background.jpg",
      status: "ready",
    };
    const before = structuredClone(original);
    setLocale("en");
    const translated = localizeContent(original);
    assert.equal(translated.name, "Leaf Village");
    assert.equal(translated.notes, "Vila da Folha");
    assert.equal(translated.id, original.id);
    assert.equal(translated.url, original.url);
    assert.equal(translated.status, "ready");
    assert.deepEqual(original, before);
    assert.equal(
      translateExternalMessage("Senha incorreta."),
      "Incorrect password.",
    );
    assert.equal(translateText("Lobo Preto"), "Black Wolf");
    assert.equal(translateText("Naruto"), "Naruto");
    setLocale("es");
    assert.equal(
      translateExternalMessage("Aguarde seu turno."),
      "Espera tu turno.",
    );
    assert.equal(translateText("Vila da Folha"), "Aldea de la Hoja");
  } finally {
    setLocale("pt-BR");
  }
});

test("editing Portuguese wording does not break canonical content or legacy API lookup", () => {
  const key = sourceMessages["Vila da Folha"];
  const mutable = portuguese as Record<string, unknown>;
  const original = mutable[key];
  try {
    mutable[key] = "Vila da Folha revisada";
    setLocale("pt-BR");
    assert.equal(translateText("Vila da Folha"), "Vila da Folha revisada");
    assert.equal(
      translateExternalMessage("Login required."),
      "É necessário entrar.",
    );
    setLocale("en");
    assert.equal(translateText("Vila da Folha"), "Leaf Village");
  } finally {
    mutable[key] = original;
    setLocale("pt-BR");
  }
});
