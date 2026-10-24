# Deferred battle effects: measured original bounds

`reports/deferred-static-bounds-20261024.json` records51actions from47original
sources, read independently by a metadata-only JPEXS probe. All51have no more
than480authoredframes. Their failure is the original canvas size, rather than
a missing frame or guessed action. The smallest is16,069,261pixels and the
largest483,585,430pixels;9actions also exceed8192pixels on one side.

17actions are at most20MP,18are20–32MP,10are32–64MP and6exceed64MP. Two other
planned actions exceed the decoded32MBsource budget. No limit was increased,
no raster output was produced and no asset was resized or replaced. The
original source records and sprite hashes remain attached to each row.

## Next adapter work

Keep the ordinary extraction queue progressing. Large canvases need a separate
full-scale tiled or display-list representation. Before publishing it, compare
small supported clips against the existing whole-canvas renderer, prove tile
registration, test filters/masks across boundaries and compare overlap regions
from shifted tile partitions. Preserve complete FPS/timeline, original bounds,
empty tiles and exact scale. Tiles must remain source-only until a bounded
runtime loader is validated. Merely raising every memory ceiling is not an
extraction proof.

The timestamped progress report uses exact plan-key intersections. Its32.12%
figure refers only to published actions in the3,263-action battle-effect plan,
not overall project completion. Three independently rechecked empty display
timelines are classified as nonvisual data, rather than missing animations.
Other format, gameplay binding and character extraction work remains separate.
