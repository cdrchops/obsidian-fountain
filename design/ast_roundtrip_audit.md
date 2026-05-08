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

> For any element that introduces paragraph spacing in the rendered
> output (Action, Dialogue, Synopsis, Lyrics, Scene heading,
> Transition, TitlePage), its `range` covers from the start of its
> first line (column 0, before any leading whitespace) through the
> end of its trailing blank-line separator (or to EOF if last).
> Inline elements (notes, styled text, parentheticals) keep tight
> ranges around the syntax itself.

The invariant: **deleting `range` from `document` removes the
element cleanly — no orphan whitespace, no stray blank lines.**
Trailing blank lines belong to the element that ends, not the one
that starts, so adjacent elements never overlap or leave gaps.

**Structural-marker carve-out:** `Section`, `Synopsis`, and
`PageBreak` are structural markers — they don't carry paragraph
spacing of their own. Their `range` covers only their marker
line. Adjacent blank lines belong to the surrounding paragraph
context (e.g., a blank line after `===` becomes an empty action
on the next page). Sections and Synopses also render invisibly
in Highland (action paragraphs flow as if the marker weren't
there).

`SceneHeading.range` and `TitlePage.range` already follow rule 2.
Other multi-line elements need an audit (see Open work).

### Optional markers: `Range | null`, never alongside a boolean

> When an optional source marker can be present or absent (`!`, `.`,
> `^`, `>`, `~`, `@`), model it as `marker: Range | null` on the
> element. The range existing is the signal that the marker is
> present. Don't also carry a `forced: boolean` — two sources of
> truth that can drift.

`Dialogue.caretRange` already follows this. The other forced markers
should follow when a feature actually needs them, dropping the
existing `forced: boolean` in the same change.

## Rule-2 conformance

Snapshot of where each line-based element stands against rule 2.
"n/a" means the spec pins the marker to column 0 (so leading
whitespace can't belong to the range) or the element is a
structural marker (so trailing blank lines belong to the
surrounding paragraph context, not to the marker).

| Element | Leading ws | Trailing blank line |
|---|---|---|
| `TitlePage` | n/a | ✅ |
| `Scene` | ✅ | ✅ |
| `Dialogue` | ✅ | ✅ |
| `Transition` (`TO:`) | ✅ | ✅ |
| `Action` (centered) | ✅ | ✅ |
| `Action` (plain) | ✅ (folded into text) | ✅ |
| `Action` (forced `!`) | n/a (spec: col 0) | ✅ |
| `Transition` (forced `>`) | n/a (spec: col 0) | ✅ |
| `Lyrics` (`~`) | n/a (spec: col 0) | ✅ |
| `Section` (`#`) | n/a (spec: col 0) | n/a (structural marker) |
| `Synopsis` (`=`) | n/a (spec: col 0) | n/a (structural marker) |
| `PageBreak` (`===`) | n/a (spec: col 0) | n/a (structural marker) |

## Open work

- [ ] **Lyrics and Scene headings appearing mid-paragraph are still
  swallowed.** Same family as the Section/Synopsis fix
  (`StructuralMarkerStart` lookahead) — extend the lookahead with
  `~` and the scene-heading prefixes when needed.
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

- `Action.range` ✅ — covers all lines including the trailing
  blank-line separator (per rule 2).
- `Action.lines: Line[]` ✅ — each line has a range.
- `Line.elements` — inner ranges (text, styled, notes, boneyard).
- Plain action lines may carry any leading whitespace as part of
  their text. Forced action (`!`) is column-0 by spec.
- `!` of forced action ❌ — `ForcedActionLine` shifts the line range
  start by `-1` to *include* the `!` but doesn't break it out.
- `>`/`<` of centered line ⚠️ — inside `Line.range`, recoverable.
  `centered: boolean` says the line is centered but doesn't locate
  the brackets. Cosmetic; leaving as-is.

### Transition

- `Transition.range` ✅ — both variants include the trailing
  blank-line separator (per rule 2). Forced (`>`) is column-0 by
  spec; unforced (`… TO:`) consumes any leading whitespace.
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

- `Section.range` ✅ — `#` is column-0 by spec (parser enforces).
  Range covers the heading line only; **no trailing blank line by
  design** — sections are invisible structural markers (Highland
  renders them as nothing), so they don't carry paragraph spacing.
  See the structural-marker carve-out in rule 2.
- `Section.depth: number` — count of `#`s. The `#` characters live at
  `range.start..range.start + depth` (fixed-offset carve-out).

### Synopsis

- `Synopsis.range` ✅ — `=` is column-0 by spec (parser enforces).
  Range covers the synopsis line(s) only; **no trailing blank line
  by design** — Highland renders synopses as invisible structural
  markers, same as Section. See the structural-marker carve-out in
  rule 2.
- `Synopsis.lines: Line[]` ✅ — each line range excludes the leading
  `=` and trailing `\n`.
- `=` markers ⚠️ — inside `range`.

### Lyrics

- `Lyrics.range` ✅ — `~` must be at column 0 per the Fountain spec
  (matches Highland), so leading whitespace is n/a. Trailing
  blank-line separator is included (rule 2).
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

- `PageBreak.range` ✅ — `===` is column-0 by spec (parser enforces).
  Range covers the marker line only; **no trailing blank line by
  design** — page breaks are structural markers (a blank line after
  `===` becomes an empty action on the next page). See the
  structural-marker carve-out in rule 2.
- `===` lives inside `range` (fixed-offset carve-out).

### Styled text (bold/italics/underline)

- `StyledTextElement.range` ✅ — includes opening and closing markers.
- `elements: StyledText[]` ✅ — inner elements have ranges.
- `*` / `**` / `_` markers ⚠️ — inside the outer range, not labeled.
  Editor currently decorates the whole span without dimming markers.
