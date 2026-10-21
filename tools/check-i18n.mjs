import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
const directory = "src/i18n/locales";
const catalogs = Object.fromEntries(
  fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => [
      file,
      JSON.parse(fs.readFileSync(`${directory}/${file}`, "utf8")),
    ]),
);
const source = catalogs["pt-BR.json"];
for (const key of Object.values(
  JSON.parse(fs.readFileSync("src/i18n/sources.json", "utf8")),
))
  assert.ok(
    Object.hasOwn(source, key),
    `Unknown canonical source message: ${key}`,
  );
const slots = (value) =>
  [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
for (const [name, catalog] of Object.entries(catalogs)) {
  assert.deepEqual(
    Object.keys(catalog).sort(),
    Object.keys(source).sort(),
    `${name}: message keys differ`,
  );
  for (const [key, message] of Object.entries(catalog)) {
    const base = source[key];
    assert.equal(
      typeof message,
      typeof base,
      `${name}:${key}: message type differs`,
    );
    for (const form of typeof base === "string"
      ? ["text"]
      : Object.keys(base)) {
      const text = form === "text" ? message : message[form];
      const reference = form === "text" ? base : base[form];
      assert.ok(
        typeof text === "string" && text.trim().length,
        `${name}:${key}: empty message`,
      );
      assert.deepEqual(
        slots(text),
        slots(reference),
        `${name}:${key}: interpolation parameters differ`,
      );
      assert.ok(
        !/<\/?(?:script|img|iframe|button|a|div)\b/i.test(text),
        `${name}:${key}: catalogs must contain plain text`,
      );
    }
  }
}
const files = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(`${directory}/${entry.name}`)
        : entry.name.endsWith(".ts")
          ? [`${directory}/${entry.name}`]
          : [],
    );
let calls = 0;
for (const file of files("src").filter(
  (file) => !file.startsWith("src/i18n/"),
)) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["t", "th"].includes(node.expression.text) &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const key = node.arguments[0].text;
      assert.ok(Object.hasOwn(source, key), `${file}: unknown message ${key}`);
      const message = source[key];
      const expected = [
        ...new Set(
          slots(typeof message === "string" ? message : message.other),
        ),
      ];
      const params = node.arguments[1];
      if (!params || ts.isObjectLiteralExpression(params)) {
        const actual = params
          ? params.properties
              .filter(property => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
              .map((property) =>
                property.name.getText(ast).replace(/['"]/g, ""),
              )
          : [];
        assert.deepEqual(
          actual.sort(),
          expected.sort(),
          `${file}:${key}: interpolation arguments differ`,
        );
      }
      calls++;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
for (const [, key] of fs
  .readFileSync("index.html", "utf8")
  .matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g))
  assert.ok(Object.hasOwn(source, key), `index.html: ${key}`);
console.log(
  `i18n: ${Object.keys(source).length} keys, ${Object.keys(catalogs).length} complete languages, ${calls} source references; placeholders and HTML checked.`,
);
