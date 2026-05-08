# AST Round-Trip Audit

How we want the AST to relate to source positions, why, and where we
currently fall short. The rules are aspirational; the inventory at
the bottom is the running checklist of gaps to close opportunistically
or to consult when adding new syntax.

## Design rules

### Every significant span has a range

> If a piece of source text is syntactically significant *and* its
> position isn't trivially derivable from the element's range plus a
> fixed-length marker, give it a `Range` in the AST.

Consumers should never have to scan `document` to find "where's the
`!` of this forced action?" or "where's the `^` of this dual
dialogue?". Editor decorations, edits, and refactors all anchor on
ranges; offset arithmetic from a known byte is brittle.

**Carve-out for fixed-offset markers:** the `#` prefix of a
`Section` (length `depth`, always at `range.start`) and the `===` of
a `PageBreak` are predictable enough that documenting the offset in
`types.ts` beats adding a redundant range field.

### Line-based elements own their lines

> For any element that occupies one or more whole source lines, its
> `range` covers from the start of its first line (column 0, before
> any leading whitespace) through the end of its trailing
> blank-line separator (or to EOF if last). Inline elements (notes,
> styled text, parentheticals) keep tight ranges around the syntax
> itself.

The invariant: **deleting `range` from `document` removes the
element cleanly — no orphan whitespace, no stray blank lines.**
Trailing blank lines belong to the element that ends, not the one
that starts, so adjacent elements never overlap or leave gaps.

`SceneHeading.range` and `TitlePage.range` already do this. Other
multi-line elements need an audit (see Open work).

### Optional markers: `Range | null`, never alongside a boolean

> When an optional source marker can be present or absent (`!`, `.`,
> `^`, `>`, `~`, `@`), model it as `marker: Range | null` on the
> element. The range existing is the signal that the marker is
> present. Don't also carry a `forced: boolean` — two sources of
> truth that can drift.

`Dialogue.caretRange` already follows this. The other forced markers
should follow when a feature actually needs them, dropping the
existing `forced: boolean` in the same change.

## Open work

- [ ] **Audit multi-line elements against rule 2.** Likely outliers:
  - `ForcedActionLine` shifts start by `-1` for the `!` but doesn't
    extend further left for leading whitespace.
  - Multi-line `Action` / `Dialogue` / `Lyrics` / `Synopsis` need a
    check for trailing-blank-line inclusion.
- [ ] **Forced-marker ranges** on Action/Scene/Transition. Replace
  `forced: boolean` per rule 3. Add when a feature wants them.
- [ ] **Styled-text marker ranges** for `*`/`**`/`_`. Add when the
  editor wants to dim markers vs. the text inside.
- [ ] **Promote the rules into `parser.peggy`'s top comment block**
  once one or two more audit items are closed and the patterns feel
  settled.

## Inventory

Notation: ✅ explicit range; ⚠️ recoverable by arithmetic but no
field; ❌ not recoverable from AST alone.

### Title page

- `TitlePage.range` ✅ — entire block, including trailing blank-line
  separator. Cuts cleanly per rule 2.
- `TitlePage.keyValues: KeyValue[]` — entries.
- `KeyValue.range` ✅ — `Key: value` block including trailing newline.
- `KeyValue.key` — fixed offset (`range.start..range.start +
  key.length`); documented in `types.ts`.
- `KeyValue.values: StyledText[]` — inner elements have ranges.

### Scene heading

- `SceneHeading.range` ✅ — full element including trailing blank line.
- `SceneHeading.heading` — string only.
- `SceneHeading.forced: boolean` ⚠️ — `.` lives inside `range`. Per
  rule 3, replace with `forcedMarker: Range | null` if needed.
- `SceneHeading.number` ✅ — `Range | null`, points at `#…#`
  including delimiters.

### Action

- `Action.range` ✅ — full element.
- `Action.lines: Line[]` ✅ — each line has a range.
- `Line.elements` — inner ranges (text, styled, notes, boneyard).
- `!` of forced action ❌ — `ForcedActionLine` shifts the line range
  start by `-1` to *include* the `!` but doesn't break it out.
- `>`/`<` of centered line ⚠️ — inside `Line.range`, recoverable.
  `centered: boolean` says the line is centered but doesn't locate
  the brackets. Cosmetic; leaving as-is.

### Transition

- `Transition.range` ✅
- `Transition.forced: boolean` ⚠️ — `>` inside `range`, no separate
  field. `extractTransitionText` strips it via string trimming
  rather than range slicing.

### Dialogue

- `Dialogue.range` ✅
- `Dialogue.characterRange` ✅
- `Dialogue.characterExtensionsRange` ✅
- `Dialogue.content: DialogueContent[]` ✅ — each has a range.
- `Dialogue.caretRange` ✅ — `Range | null`, covers the `^` of a
  dual dialogue. Source of truth for "is this dialogue marked dual";
  the separate `dual: boolean` field is a derived pairing result set
  after parsing.

### Parenthetical

- `DialogueContentParenthetical.range` ✅ — covers `(…)`.
- Opening/closing parens ⚠️ — recoverable from `range.start` and
  `range.end - 1`.

### Section

- `Section.range` ✅ — full line including trailing newline.
- `Section.depth: number` — count of `#`s. The `#` characters live at
  `range.start..range.start + depth` (fixed-offset carve-out).

### Synopsis

- `Synopsis.range` ✅
- `Synopsis.lines: Line[]` ✅ — each line range excludes the leading
  `=` and trailing `\n`.
- `=` markers ⚠️ — inside `range`.

### Lyrics

- `Lyrics.range` ✅
- `Lyrics.lines: Line[]` ✅
- `~` markers ⚠️ — inside `Line.range` (which includes `~text`).

### Note

- `Note.range` ✅ — full `[[ … ]]`.
- `Note.textRange` ✅ — inner content excluding brackets and noteKind.
- `Note.noteKind: string` ⚠️ — kind prefix (`>`, `+`, `-`, `todo:`)
  inside `range` but not separately ranged.

### Boneyard

- `Boneyard.range` ✅ — full `/* … */`.
- `/*` and `*/` ⚠️ — inside `range`.

### Page break

- `PageBreak.range` ✅ — full element.
- `===` lives inside `range` (fixed-offset carve-out).

### Styled text (bold/italics/underline)

- `StyledTextElement.range` ✅ — includes opening and closing markers.
- `elements: StyledText[]` ✅ — inner elements have ranges.
- `*` / `**` / `_` markers ⚠️ — inside the outer range, not labeled.
  Editor currently decorates the whole span without dimming markers.
