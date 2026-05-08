# AST Round-Trip Audit

A working list of the "every syntactically-significant span has a
range" property — what we want, where we hold it, where we don't, and
what to do about it.

## The property

> Every syntactically-significant piece of source text has a `Range`
> in the AST that points at it.

Stronger version (probably aspirational): given only the structured
AST (no `document` access), you can reconstruct the source string.

We commit to the weaker, useful form: **every span we'd ever want to
highlight, decorate, edit, or treat specially has an explicit range
in the AST.** Consumers should never have to scan `document` to find
"where's the `!` of this forced action?" or "where's the `^` of this
dual dialogue?".

Why it matters:

- **Editor decorations** (CodeMirror) anchor on ranges. Scanning
  source from a known offset is brittle — drift (whitespace,
  byte-vs-char) is easy.
- **Edits** target ranges. Removing a forced marker, renaming a scene,
  toggling a transition — all easier with explicit ranges.
- **Refactors** that touch the parser stay honest. A new piece of
  syntax should come with a new range field, not a "look at byte N+1
  of the element."
- **Debug & testing.** Tests can assert ranges for source positions
  without computing offsets manually.

## What this audit is for

Two passes:

1. **Inventory.** List every `FountainElement` and sub-element kind,
   note which sub-spans have explicit ranges and which require
   offset arithmetic from the element's outer range.
2. **Decide.** For each missing range: add it, accept the gap with a
   comment, or document why it's intentional.

This isn't a single-PR project — it's a checklist to work through
opportunistically (and to consult when adding new syntax).

## Inventory

Notation: ✅ = explicit range; ⚠️ = recoverable by arithmetic but no
field; ❌ = not recoverable from AST alone.

### Title page

- `TitlePage.range` — ✅ covers the entire title-page block including
  the trailing blank-line separator between the title page and the
  body. Deleting `range` from `document` removes the title page
  cleanly.
- `TitlePage.keyValues: KeyValue[]` — entries.
- `KeyValue.range` — ✅ covers the `Key: value` block including its
  trailing newline. Symmetric across entries — order-independent.
- `KeyValue.key` — string, fixed offset (`range.start..range.start +
  key.length`). No separate range; documented in `types.ts`.
- `KeyValue.values` — `StyledText[]`. Inner elements have ranges.

### Scene heading

- `SceneHeading.range` — ✅ full element including trailing blank line.
- `SceneHeading.heading` — string (text only, no range).
- `SceneHeading.forced` — boolean. ⚠️ The `.` of a forced heading is
  inside `range` but has no separate range field.
- `SceneHeading.number` — ✅ `Range | null`, points at `#…#` including
  delimiters.

**Action:** if we ever want to style the leading `.` of a forced
scene specially, add `forcedMarkerRange: Range | null`. No demand
yet.

### Action

- `Action.range` — ✅ full element.
- `Action.lines: Line[]` — ✅ each line has a range.
- `Line.elements` — has ranges (text, styled text, notes, boneyard).
- The `!` of a forced action — ❌ **no range field.**
  `ForcedActionLine` shifts the range start by `-1` so the line range
  *includes* the `!`, but the `!` itself isn't broken out.
- The `>` and `<` of a centered line — ⚠️ inside `Line.range`,
  recoverable but not labeled. `centered: boolean` says "this line is
  centered" but doesn't tell you the bracket positions.

**Action:** `forcedMarkerRange` on `Line` (or on `Action`) for `!`.
Centered brackets are probably fine to leave as-is — they're cosmetic
and live at line boundaries.

### Transition

- `Transition.range` — ✅
- `Transition.forced` — boolean. ⚠️ The `>` of a forced transition is
  inside `range` but no separate range. `extractTransitionText` strips
  it via string manipulation.

**Action:** `forcedMarkerRange: Range | null`. Would let
`extractTransitionText` be range-driven instead of string-trimming.

### Dialogue

- `Dialogue.range` — ✅
- `Dialogue.characterRange` — ✅
- `Dialogue.characterExtensionsRange` — ✅
- `Dialogue.content: DialogueContent[]` — each has a range.
- `Dialogue.caretRange` — ✅ `Range | null`, covers the `^` of a dual
  dialogue. There is no separate `dual` boolean for this marker —
  the range alone is the source of truth (the AST's `dual: boolean`
  field is a derived property of pairing, set after parsing).

### Parenthetical

- `DialogueContentParenthetical.range` — ✅ covers `(…)`.
- The opening `(` and closing `)` aren't separately ranged. ⚠️
  Recoverable from `range.start` and `range.end - 1`.

### Section

- `Section.range` — ✅ full line including trailing newline.
- `Section.depth` — number (count of `#`s). ⚠️ The `#` characters
  themselves aren't separately ranged.

**Action:** `Section.title: string` is *not* stored — consumers slice
from `range`. If we ever want to highlight just the title text (vs.
the `#`s), add `titleRange: Range`. Currently not needed.

### Synopsis

- `Synopsis.range` — ✅
- `Synopsis.lines: Line[]` — ✅ each line range excludes the leading
  `=` and trailing `\n` (per AST comment).
- The `=` characters — ⚠️ live in `range` but not separately.

**Action:** if we want to highlight the `=` markers, add ranges. Not
currently needed.

### Lyrics

- `Lyrics.range` — ✅
- `Lyrics.lines: Line[]` — ✅
- The `~` markers — ⚠️ inside the `Line.range` (it includes `~text`).

**Action:** `~` separate range if we ever want to dim it like the
proposed dual-dialogue caret.

### Note

- `Note.range` — ✅ full `[[ … ]]`.
- `Note.textRange` — ✅ inner content excluding brackets and noteKind
  prefix.
- `Note.noteKind: string` — string. ⚠️ The kind prefix (e.g., `>`,
  `+`, `-`, `todo:`) is inside `range` but not separately ranged.

**Action:** if we want to highlight the noteKind prefix, add
`noteKindRange: Range | null`. Not currently needed.

### Boneyard

- `Boneyard.range` — ✅ full `/* … */`.
- The `/*` and `*/` markers — ⚠️ inside `range`, not separately
  labeled.

### Page break

- `PageBreak.range` — ✅ full element.
- The `===` — ⚠️ inside `range`.

### Styled text (bold/italics/underline)

- `StyledTextElement.range` — ✅ includes opening and closing markers.
- `elements: StyledText[]` — inner elements have ranges.
- The `*`, `**`, `_` markers themselves — ⚠️ inside the outer range
  but not separately labeled.

**Action:** for editor highlighting (dim the markers, show only the
text), separate ranges would help. Currently the editor decorates the
whole styled span; markers aren't dimmed.

### Forced markers, summary

The recurring gap: forced markers (`!` action, `.` scene, `>`
transition, `@` character, `~` lyrics, `^` dual-dialogue) all live
inside their element's range without a separate range field. Most of
the time this is fine. But every "I want to style/highlight just the
marker" feature has had to do offset arithmetic. `caretRange` for `^`
already does this for dual dialogue; the consistent move is to do the
same for the other markers when there's demand.

**Pattern:** `forcedMarker: Range | null` on each element that has a
forced marker. `null` when not forced. Do **not** carry both a
`forced: boolean` AND a range — that's two sources of truth that can
get out of sync. The range existing is the signal that the marker is
present (mirrors how `caretRange` already works on `Dialogue`).

When adding the field, drop the existing `forced: boolean` in the
same change. Call sites become `if (action.forcedMarker)` instead of
`if (action.forced)` — no real readability loss.

## Decisions / TODOs

In rough priority order:

- [x] **Dual dialogue `caretRange`** — done as part of the dual
  dialogue work. Range-only, no `dual` boolean for the marker.
- [x] **Title page block as its own AST node** — closed by introducing
  `TitlePage { keyValues, range }`. `range` covers the whole block
  including the trailing blank-line separator; `KeyValue.range`
  reverts to symmetric per-entry coverage with no order-dependent
  asymmetry.
- [ ] **Audit other line-based elements against the principle below.**
  Specifically: does every line-based element's `range` start at
  column 0 of its first line (including leading whitespace) and end
  after its trailing blank-line separator? Likely outliers:
  - `ForcedActionLine` shifts start by `-1` for the `!` but doesn't
    extend further left for any whitespace.
  - Multi-line `Action`/`Dialogue`/`Lyrics`/`Synopsis` need a check
    for trailing-blank-line inclusion.
- [ ] **Forced-marker ranges** — pattern: `forcedMarker: Range | null`
  on Action/Scene/Transition (replacing the `forced: boolean`, not
  alongside it). Add when a feature actually wants them. Not now.
- [ ] **Styled-text marker ranges** — similar; add when the editor
  wants to dim `**…**` markers vs. the bold text inside.

## Standing rules

### Range coverage

> If a piece of source text is syntactically significant *and* its
> position isn't trivially derivable from the element's range plus a
> fixed-length marker, give it a `Range` in the AST. For optional
> markers, prefer `Range | null` over a separate boolean — don't
> carry both, since that's two sources of truth that can drift.

The "fixed-length, fixed-offset" carve-out covers things like the `#`
prefix of a `Section` (always at `range.start`, length `depth`) or
the `===` of a `PageBreak` — document the offset in `types.ts` rather
than duplicating it as a range.

### Line-based elements

> For any element that occupies one or more whole source lines, its
> `range` covers from the start of its first line (column 0, before
> any leading whitespace) through the end of its trailing
> blank-line separator (or to EOF if last). Inline elements (notes,
> styled text, parentheticals) keep tight ranges around the syntax
> itself.

The invariant this gives you: **deleting `range` from `document`
removes the element cleanly with no orphan whitespace or stray blank
lines.** Adjacent elements never overlap or leave gaps; trailing
whitespace and the blank-line separator belong to the element that
ends, not the one that starts.

`SceneHeading.range` already does this for the trailing-blank-line
side (per its comment). `TitlePage.range` does it for both. The
remaining elements need an audit (see the TODO above).

Add these rules to the parser-grammar comment block at the top of
`parser.peggy` once we've worked through the audit items above and
the patterns are established.
