# Local full sequence review

Run `python tools/source_sequence_review.py --project .` from the repository,
then open the loopback URL printed by the tool (port8255 by default).

The service reads only installed catalog-pinned manifests and lossless frame
files. Artifact hashes are checked before serving. It binds only127.0.0.1,
rejects directory traversal, has no mutation route and cannot expose arbitrary
files or original archives. Refresh the page to include newly published clips.
It holds at most two decoded frame images, without loading the entire clip.

The review has authored-FPS playback, pause, exact frame selection, mirroring
and the original local registration marker. Display fits the window; original
stored pixels, timeline and registration stay unchanged. Blank first/final
frames are preserved. This review does not attach an effect to a character,
execute source events, resolve a hitbox or change an account/save.

Chrome displayed a real installed66-frame clip, HFkakaxiaoyi/shang, at24FPS,
including its visible middle frame. Playback, pause, scrubbing, mirroring,
registration marker and390px layout passed. Traversal returned404,POST501;
no account/save endpoint was requested. The report is
`reports/source-sequence-browser-proof.json`. This is a UI playback check;
the independent extraction reports remain the source pixel proof. A production
runtime adapter is still pending.

## Keep separate authored durations

`reports/primary-role-timing-audit.json` compares59data tracks with visual export
names:38have exact-name siblings,24durations match and14differ;21have no sibling.
No event falls outside its matching visual duration. These are name matches,
not gameplay bindings. Preserve both durations; do not stretch either track.
