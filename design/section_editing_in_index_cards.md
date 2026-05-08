# Section Editing in Index Cards

The index card view is the structural read on a script (see
`design/improved_index_card_view.md`). Until now it could only mutate
*scenes* — rename, insert, drag, drop. Sections were render-only.
This document covers the work to bring section-level shape edits up to
parity with scenes.

Implemented in v1: pencil-rename on section headings (mirrors the
scene-card pencil; edits the title text and preserves the `#…` prefix
and trailing newline verbatim, so depth is untouched).

Everything below is deferred work and the rationale that should
constrain it.

## Operations to support

The shape-vs-content split from the cards-view rationale doc applies
unchanged: sections deserve the same shape operations scenes already
have, and content edits stay in the editor.

| Operation                         | Scenes (today)            | Sections          |
| ---                               | ---                       | ---               |
| Rename heading                    | pencil → inline input     | pencil (v1)       |
| Insert before/after               | hover gutter, dashed `+`  | deferred          |
| Reorder via drag                  | grip handle, drop targets | deferred          |
| Change depth / type               | n/a                       | deferred          |
| Edit synopsis                     | editor only (by design)   | editor only       |
| Cut/copy/paste as text            | ⌘⇧L + ⌘X / ⌘C             | deferred (note 1) |

Note 1: ⌘⇧L currently selects the *current scene* via
`scene.range`. The natural extension is "select current section"
(its full subtree range). Probably worth adding alongside or just
after section drag, because the same range computation backs both.

## Why insert+drag are bundled together

A new section is degenerate when there is no content. Once you can
insert a section, the immediate next question is "and how do I move
the existing scenes under it?" — which is the drag-drop story. So
the two features together turn cards into a real outliner; either
alone is awkward. They can ship in separate PRs but they should be
designed together.

## Insertion: position + depth

Position is the same gutter-and-trailing-`+` story as scenes. The new
question is depth.

Three choices in increasing UI weight:

1. **Inherit from neighbor.** The new section gets the depth of the
   nearest existing section header. Zero new chrome. Edge case: the
   document has no sections yet — default to `#`.
2. **Tab/Shift-Tab in the rename input.** While the freshly-inserted
   section's heading input is focused, Tab indents (`#` → `##`),
   Shift-Tab outdents. Familiar to outliner users, invisible to people
   who don't need it. Composes with (1): inherit depth, then nudge.
3. **Persistent depth control on cards.** A small `#`/`##`/`###`
   indicator next to the pencil. Discoverable but adds a second
   card-level affordance. The rationale doc warns against drifting
   toward `⋯`-menu territory; this is on the way.

Recommended: (1) + (2). (3) is overkill for a feature most users will
touch rarely.

## Changing depth of an existing section

Distinct from insertion: the user has a `# Section A` and wants it
to become `## Section A`. The simplest possible implementation drops
the "edit just the title" rule of the v1 pencil — let the user type
the `#`s themselves, and refuse to save anything that doesn't start
with `#`+space.

Cost: exposes a sliver of Fountain syntax to the cards view. Benefit:
zero new UI; the existing rename input does it.

This does *not* cascade to children. Increasing a section's depth
without also increasing its descendants' depth flattens the
hierarchy:

```fountain
# Act One         →   ## Act One
## Scene work     →   ## Scene work    (now a sibling of Act One)
### Beat          →   ### Beat         (now a child of Scene work)
```

Most real depth changes want the cascade — "I'm pushing this section
down a level along with everything under it." So the simple-edit
approach is a useful first step but it is not the complete depth-edit
story. The complete story is one of:

- A separate "indent / outdent subtree" command (keyboard or menu)
  that emits edits for the whole subtree at once. Composes cleanly
  with the simple-edit approach, which then becomes the escape hatch
  for the rare "I really do want only this header to change."
- Tab/Shift-Tab during rename, with cascade implicit. Simpler from
  the user's side but requires the rename input to know about the
  subtree.

The first path keeps the rename input dumb. Recommended.

## Insertion: which gutter inserts what

Today the per-card insertion gutter inserts a *scene* before that
card. The trailing dashed `+` inserts a scene at the end of the
current section. Sections need their own insert affordances without
making the existing ones ambiguous.

Two viable shapes:

- **Section gutter above section headings, scene gutter on cards
  unchanged.** A new hover-revealed insertion bar attached to each
  `.section-heading-row` inserts a section *before* that section. The
  trailing dashed `+` stays scene-only. To add the very first section
  in a document or insert a section between two scenes, use a sibling
  affordance at section-content boundaries.

- **`+` chooser.** The dashed `+` and gutter both grow a tiny
  picker ("scene" / "section"). One affordance covers both. Cost: an
  extra click, and the chooser is visual noise in the common case
  (scenes vastly outnumber sections in a typical script).

Recommended: dedicated section gutter on section headers. Keeps the
common scene-insertion path one click. Section insertion is rare
enough that "find a section header, hover above it" is acceptable.

## Drag-drop: same-depth reordering only

A section drag moves the entire subtree (heading + all children).
The drag source is a grip handle on `.section-heading-row`, mirroring
the scene-card grip.

For the v1 of this feature, drop targets are restricted to
**siblings of the dragged section at the same depth**. Drop indicators
appear only between same-depth section headers (and at the very
beginning/end of the parent section's content).

Why same-depth only:

- The visual story for "drop a `##` into a different `#`'s body and
  re-parent it" is genuinely hard. The drop indicator has to convey
  both *position* and *new parent*, and the latter has no obvious
  visual vocabulary. Cards' current insertion bar is purely
  positional — re-parenting needs something different.
- Most real reorders are sibling reorders ("Act 2 should come before
  Act 3"). Re-parenting is rare and is well-served by editor
  cut-and-paste.

Re-parenting via drag remains a possible future feature; the
visual-story problem is the actual blocker, not the edit math.

## Drag-drop: dropping scenes across sections

Today scene drops only land *next to* an existing scene card —
`installDragAndDropHandlers` only attaches to real cards, not the
trailing dashed `+`, and not to section headers. Consequence: a
section with zero scenes (or any boundary with no adjacent scene) is
unreachable as a drop destination. With

```fountain
# Section 1
# Section 2
.A SCENE
# Section 3
```

`A SCENE` cannot be dropped before `# Section 1`, between `Section 1`
and `Section 2`, or after `# Section 3` — all four positions have no
neighboring card to anchor a drop.

The fix is to make the dashed `+` placeholder a drop target (drop
inserts at the placeholder's position rather than triggering insert),
and to make the section-heading rows themselves drop targets at their
start/end. This is wholly separable from the section-drag work and
could ship first; tracking it here because the same set of code paths
is touched.

A clearer destination cue when a scene crosses a section boundary is
a smaller follow-up to that work.

## Synopsis editing on cards

Same constraint as scene synopses: section synopses contain styled
text (`[[>...]]` links, formatting, notes), which can't be edited by
a plain `<textarea>`. The fast path is unchanged: click into the
editor, edit, ⌘⇧I back. Out of scope for the section-editing work.

## Affordance budget on the section-heading row

Today the row carries: heading text + pencil. Adding insertion gutter,
drag handle, and (optionally) depth indicator pushes against the
"keep cards quiet" constraint. Order of priority if we decide some
have to go:

1. Pencil (rename) — already there, never remove.
2. Drag grip — needed for reorder; without it, no drag.
3. Insertion gutter — affordance, can be a sibling element rather
   than on the row itself.
4. Depth indicator — only if we reject Tab/Shift-Tab.

## Open questions before implementation

- Confirm the depth model for inserts. **Inherit-depth +
  Tab/Shift-Tab** keeps the cards view free of Fountain syntax;
  **let the user type `#`s in the rename input** is even simpler and
  uniformly handles inserts and existing-section depth edits, at the
  cost of exposing the marker. Both leave the cascade question for a
  separate indent/outdent-subtree command.
- Confirm **same-depth-only** drag drops as the v1 scope for section
  reorder.
- Confirm scope for "scene drops into empty/boundary positions" —
  ship as part of the section-drag PR or as a separate prerequisite?
- For the section-insertion gutter: is the drop indicator visually
  distinct from the scene-insertion gutter, or identical? Identical
  is simpler; distinct (e.g., spans the full width of the section
  group) communicates "this inserts a *section*, not a scene."
