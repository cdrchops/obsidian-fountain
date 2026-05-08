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

- `KeyValue.range` — ✅ covers the whole `Key: value` block.
- `KeyValue.key` — string, no range. ⚠️ recoverable as
  `range.start..range.start + key.length`.
- `KeyValue.values` — `StyledText[]`. Inner elements have ranges.
- The `\n` separator that `TitlePage` consumes between the last
  `KeyValue` and the first `Element`: ❌ **gap**. Not in any range.
  The only place where the AST cannot reproduce a source byte.

**Action:** consider extending the last `KeyValue.range` to include
the separator newline, or adding a `titlePage.range` covering the
whole title page. Low priority — round-trip from `document` always
works.

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
- `Dialogue.caretRange` — ✅ (per dual-dialogue plan; not yet
  implemented).

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
marker" feature has had to do offset arithmetic. The dual-dialogue
plan introduces `caretRange` for `^`; the consistent move is to do
the same for the other markers when there's demand.

A pattern: `<elementName>MarkerRange: Range | null` on each element
that has a forced marker. `null` when not forced.

## Decisions / TODOs

In rough priority order:

- [ ] **Dual dialogue `caretRange`** — covered by the dual dialogue
  plan; do it as part of that work.
- [ ] **Title page separator newline** — close the gap by extending
  the last `KeyValue.range` to include the `\n`, or add a
  `titlePage.range`. Low priority; no consumer breaks today.
- [ ] **Forced-marker ranges** — pattern: `forcedMarkerRange: Range |
  null` on Action/Scene/Transition. Add when a feature actually wants
  them. Not now.
- [ ] **Styled-text marker ranges** — similar; add when the editor
  wants to dim `**…**` markers vs. the bold text inside.

## Standing rule

When adding new syntax to the parser:

> If a piece of source text is syntactically significant (a marker, a
> delimiter, an attribute) — give it a `Range` in the AST. Don't make
> consumers compute it from offsets.

Add this to the parser-grammar comment block at the top of
`parser.peggy` once we've done one or two of the audit items above
and the pattern is established.
