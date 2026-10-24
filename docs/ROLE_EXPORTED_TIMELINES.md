# Primary role timelines without MME Config

Seven pinned originals use exported sprite timelines rather than the MME Config
adapter. Numeric filenames remain source identifiers, never playable identities.

## Preserved data

`asset-source/role-exported-data/index.json` contains 59 authored `_Data` actions,
covering 2,344 frames at the original 24 FPS. Every frame, label, named instance,
ratio and fixed-point matrix was compared against an independent JPEXS timeline
read. The seven compressed reports retain both readings and source hashes.
Labels retain their complete text and original payload, including whether the
optional named-anchor byte was present. Absent and false anchor bytes are kept
distinct in the source metadata, though JPEXS reports both as false.

These labels are inert. `e:hit` does not cause damage; points do not define a
hitbox. Coordinates remain local, with original twips and the exact division by
20. Referenced marker sprites may contain artwork; they are fingerprinted and
never misrepresented as empty sprites. No source scripts are executed.

## Visual extraction

`asset-source/role-exported-visual-plan.json` pins 93 visual actions and 6,368
frames. A planned action is not an extracted action. The explicit
`role-left-exported-sprite` adapter rejects `_Data`, wrong source kinds, scripts
on the selected timeline, named visual placements and changed provenance.
An exact same-name `_Data` companion is recorded only as a name match. Its
duration may differ; no stretching or synchronization is guessed.

Prepared graphics require every reconstructed RGBA frame and original source
fact to pass before publication. Oversized atlases use complete lossless source
sequences outside `public`; they still need a runtime viewer. There is no root
frame fallback, invented action, downscaling or automatic skill binding.

The admin lists these as character sources, separately from battle effects and
scenes. Preview bindings are always empty. This source review does not replace
the existing playable character catalog, unlock a character, or change saves.

## Remaining integration

Playable identity, equipment, ground/shadow attachment, skill configuration and
gameplay collision windows need separate verified bindings. Static extraction
does not prove behavior of runtime scripts or external attachments.

## Earlier MME deferrals

The same queue also plans 23 previously deferred preferred-MME actions (1,975
frames), using the existing static MME display-list renderer and lossless
variable rectangle packing or complete source sequences. `role-mme-action` is
an explicit, separately validated source kind. It preserves preferred ConfigAMF
selection, the original core evidence, authored events and local registrations.
The earlier role catalog is preserved byte for byte; no completed model is
re-rendered or replaced. The external `A_3hit yingzi` shadow action remains
excluded because it needs a separately verified external attachment.

These are static display-list proofs, not Flash player captures. In particular,
background-dependent blend behavior is not proven by an isolated transparent
canvas. Color and blend fields are preserved, never silently removed.

## Exact external shadow dependency

`asset-source/role-shadow-dependency.json` preserves the separate 28-frame
`A_3hit yingzi` track, its exact `yingzi(1).png` reference and all local authored
placements. Preferred AMF and original XML registrations agree. The embedded
original PNG was independently decoded and its RGBA hash matched the already
published 212×73 shared asset at offset (-106,-36). This is complete dependency
metadata; rendering and world attachment remain pending. No suffix alias,
replacement shadow, live ellipse removal, or duplicate shadow is applied.

The admin UI report uses synthetic catalog fixtures only. It verifies the
three language labels, filters, pagination, disabled sequence previews and
390px layout without any atlas, account or save requests. It does not prove
character pixels or source extraction.
