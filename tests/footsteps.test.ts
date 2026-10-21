import test from "node:test";
import assert from "node:assert/strict";
import { FootstepCadence } from "../src/audio/footsteps.ts";

test("footsteps follow actual walking distance without stacking at high speed or low FPS", () => {
  for (const speed of [80, 120, 180]) {
    const cadence = new FootstepCadence(),
      played: { at: number; foot: number }[] = [];
    for (let time = 16; time <= 2000; time += 16) {
      const foot = cadence.update(speed * 0.016, 16);
      if (foot !== undefined) played.push({ at: time, foot });
    }
    assert.ok(played.length >= 5 && played.length <= 11);
    for (let i = 1; i < played.length; i++) {
      assert.ok(played[i].at - played[i - 1].at >= 180);
      assert.notEqual(played[i].foot, played[i - 1].foot);
    }
  }
  const slowFrame = new FootstepCadence();
  assert.equal(slowFrame.update(1000, 10000), 0);
  assert.equal(
    slowFrame.update(1000, 16),
    undefined,
    "never catch up a backlog of footsteps",
  );
});
test("standing, obstacles, dialog pauses and short movement taps do not accumulate phantom steps", () => {
  const cadence = new FootstepCadence();
  for (let i = 0; i < 100; i++) assert.equal(cadence.update(0, 16), undefined);
  assert.equal(cadence.update(20, 100), undefined);
  cadence.update(0, 0);
  assert.equal(cadence.update(5, 16), undefined);
  cadence.update(0, 16);
  assert.equal(cadence.update(24, 100), 0);
  cadence.update(0, 0);
  assert.equal(cadence.update(24, 16), undefined);
});
