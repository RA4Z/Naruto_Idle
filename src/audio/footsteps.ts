// Distance establishes cadence; time prevents a burst at high speed/low FPS.
// Only real, continuous walking counts. Teleports, blocked input and pauses do not.
export class FootstepCadence {
  private distance = 0;
  private elapsed = 1000;
  private next = 0;
  update(distance: number, delta: number): 0 | 1 | undefined {
    this.elapsed = Math.min(
      1000,
      this.elapsed + Math.max(0, Math.min(100, delta)),
    );
    if (!Number.isFinite(distance) || distance <= 0.01) {
      this.distance = 0;
      return;
    }
    this.distance = Math.min(48, this.distance + distance);
    if (this.distance < 24 || this.elapsed < 180) return;
    this.distance = 0;
    this.elapsed = 0;
    const step = this.next as 0 | 1;
    this.next = 1 - this.next;
    return step;
  }
}
