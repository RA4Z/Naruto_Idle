import assert from "node:assert/strict";
import test from "node:test";
import { animationOrigin } from "../src/entities/animation-origin";

test("compact frames preserve their source ground offset, including outside the cell", () => {
  const action = {
    origin: [0.5, 1] as [number, number],
    frameOrigins: [
      [0.2, 0.9],
      [-12.5, 1.4],
    ] as [number, number][],
  };
  assert.deepEqual(animationOrigin(action, "1"), [-12.5, 1.4]);
  assert.deepEqual(animationOrigin(action, 0), [0.2, 0.9]);
  assert.deepEqual(animationOrigin(action, 4), [0.5, 1]);
});

test("legacy and invalid optional origins fall back without changing the animation", () => {
  const legacy = { origin: [0.4, 0.8] as [number, number] };
  assert.equal(animationOrigin(legacy, 7), legacy.origin);
  assert.deepEqual(
    animationOrigin({ ...legacy, frameOrigins: [[NaN, 1]] }, 0),
    legacy.origin,
  );
});
