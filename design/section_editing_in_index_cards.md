# Section Editing in Index Cards

The index card view is the structural read on a script (see
`design/improved_index_card_view.md`). Until now it could only mutate
*scenes* — rename, insert, drag, drop. Sections were render-only.
This document covers the design for bringing section-level shape edits
up to scene parity.

Design was validated through a standalone prototype at
`design/index_cards_prototype.html` (mock data, no Fountain parser).

Implemented in v1: pencil-rename on section headings.

## Status

| Operation              | Scenes (today)            | Sections                                |
| ---                    | ---                       | ---                                     |
| Rename heading         | pencil → inline input     | pencil (v1)                             |
| Insert at position     | hover gutter, dashed `+`  | designed below                          |
| Delete (header only)   | n/a                       | designed: empty rename input            |
| Change depth           | n/a                       | designed: edit `#`s in rename input     |
| Reorder via drag       | grip handle, drop targets | **postponed**                           |
| Edit synopsis          | editor only (by design)   | editor only                             |
| Cut/copy/paste as text | ⌘⇧L + ⌘X / ⌘C             | follow-up                               |

## Insertion

Section insertion happens through two affordances, chosen so the
common case (scene-shaped operation) stays one click.

### Vertical gutter on scene cards — `+` and `#`

The hover-revealed vertical gutter that already inserts a scene now
carries two stacked buttons: `+` (scene) and `#` (section). The
gutter appears at:

- The left edge of any scene card → inserts before that card.
- The right edge of the last *direct* scene of a section → inserts
  at the boundary between this section's direct scenes and any
  nested subsection (or end of section if no subsection follows).

Each gutter has its **own** hover trigger, not the card-slot's.
That avoids surfacing both left and right gutters at once when the
cursor is on the body of the last card.

The `#` button always creates a depth-1 (`#`) section. Promote later
via the pencil. The cards view does not expose a depth picker on
insert.

### Horizontal `+ section` bar — only at the edges

It appears in two places only:

- **Above the first section** when the document either has no
  preceding root-level scenes, or is empty.
- **At the bottom of the document** (the tail zone) — the persistent
  insertion point at end-of-doc.

It does **not** appear above every section. Inserting a section
between adjacent sections is reachable via the vertical `#` button on
the previous section's last direct scene. Adding a horizontal bar at
every section boundary was prototyped and judged redundant.

Both bars on an empty doc do the same thing (push a section to root),
but both are shown anyway so the user doesn't have to wonder which
one to use — wherever you hover, the affordance is there.

### Dashed `+` card — empty sections and empty docs

An empty section shows a single dashed `+` card. It is the
persistent aim point for "add the first scene here," and it is a
scene-drag drop target — which solves the older
"empty-sections-are-unreachable-as-drop-destinations" bug from before
this redesign.

An empty document shows the same dashed `+` card *plus* the top-of-
doc and tail `+ section` bars, so the user can start by defining
sections first or by defining scenes first. The dashed card click
adds a scene (same semantics as the dashed `+` elsewhere); the
section bars add a section.

### Auto-rename on section insert

Every section-insertion path (vertical `#` button, horizontal
`+ section` bar, top-of-doc bar, tail-zone bar) opens the rename
input on the freshly-inserted section. The input pre-selects only
the title portion (after the `#…` prefix), so typing replaces just
the title without breaking the rename's parse rules.

### Tree placement of `#` insertions

The cards view operates on a parsed tree, but Fountain semantics are
source-text driven. The `#` button is conceptually "insert
`# New section\n` at the corresponding source offset, then reparse."

Two cases are well-defined and worth describing in product terms:

- **At root**: the new `#` is a sibling of the existing top-level
  sections at the chosen index.
- **Inside a top-level section**: the new `#` ends the parent
  section in source order. Everything from the click-index onwards
  becomes the new section's content; the new section is placed as
  a root-level sibling of the parent.

A deeper case (clicking `#` inside a nested subsection) ends both
the nested section and its parent in source. The prototype handles
this naively (just splice in place), which produces a wrong tree;
production code should emit the source-text edit and let the parser
produce the tree. The cards view re-renders from the fresh parse.

## Depth changes — and deletion — through the rename input

Depth changes happen through the rename input. The input shows
`## Title` (leading `#`s plus title); the user edits either.

On commit:

- `## Foo` → keeps depth 2, sets title `Foo`.
- Change `##` to `###` → depth becomes 3, title unchanged.
- **Empty input → delete the section header.** Children are spliced
  into the parent at the same position. Mirrors the source-level
  result of deleting the `#` line.
- Malformed input (no leading `#…`) → save refused; rename cancels.

**No cascade.** Children retain their own depth. A `#` change in
source doesn't auto-renumber `##` children, and we mirror that.
"Push the whole subtree down a level" is a *separate* command
(indent/outdent subtree), not part of rename. Out of scope here.

This deliberately exposes a sliver of Fountain syntax (`#`s) in the
cards view. Acceptable because the view *already* shows `#`/`##`/
`###` in section headings, and the trade buys a single uniform
gesture covering insert-then-promote and existing-depth-change with
no extra UI.

The deletion-by-empty-input gesture is novel; the alternative
(reject empty input, add a separate "delete section" affordance)
was rejected because the heading row's affordance budget is tight
and the gesture is intuitive once seen.

## Postponed: drag-and-drop of sections

Section drag-reorder is **deliberately postponed**. The prototype
implemented same-depth-only sibling reorder, and concrete reasons to
hold:

- The drop-target story is awkward. Same-depth-only is too
  restrictive for the real reorders authors want; full re-parenting
  needs visual vocabulary the current insertion bar doesn't provide.
- Most reorders in practice are within-act scene reorders, already
  handled by scene drag.
- Cut-and-paste in the editor (⌘⇧L → ⌘X / ⌘C / ⌘V) handles the
  rare cross-cut section-level move and works across files.

When this comes back, the design questions to revisit:

- Is same-depth-only enough, or does v1 need re-parenting?
- Visual vocabulary for re-parent drops vs. position-only drops.
- The cascade question for keyboard-driven moves (⌃⌘← / ⌃⌘→ in
  Scrivener's binder is the precedent — children move with the
  parent).

## Synopsis editing on cards

Out of scope, same constraint as scene synopses: section synopses
contain styled text (`[[>...]]` links, formatting, notes) that
plain `<textarea>` can't edit. Click into the editor, edit, ⌘⇧I
back.

## Affordance budget on the section-heading row

After this work the heading row carries: heading text + pencil.
Drag grip is not added (postponed). Depth indicator is not added —
depth lives in the rename input. The row stays quiet, matching the
"cards are not a second editor" constraint from
`improved_index_card_view.md`.

## Known limitations of the chosen approach

These are accepted trade-offs, not bugs to fix.

- **Touch / mobile.** All gutters are hover-revealed. The cards view
  already relies on hover for pencil and grip, so this redesign
  doesn't make mobile worse, but it doesn't fix it either. A
  separate persistent affordance for touch is its own project.
- **No way to insert a section between two empty sections.** If the
  doc is `[Section A (empty), Section B]`, there are no scenes to
  anchor a vertical gutter, and the only horizontal bar is above
  the first section. The user has to add a scene first or use the
  editor. Rare in practice.
- **Inserting a `#` at deeper nesting** (inside a `##`) is correct
  in source semantics but the prototype's tree mutation is naive;
  production must round-trip through the parser.

## Open questions before implementation

- Verify "delete section header by clearing the rename input" with
  a real user — the gesture is novel. Fallback if it surprises:
  reject empty input and add an explicit delete affordance.
- Confirm the source-text-edit-then-reparse round-trip handles the
  deeper-nesting `#` insertion case across common authoring
  patterns. Build test cases before shipping.
- Tail-zone hover area on very long documents — does it interfere
  with scrolling? Prototype says no, but worth confirming on a
  real-sized script.
