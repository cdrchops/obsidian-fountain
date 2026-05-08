# Dual Dialogue

A plan for implementing Fountain's dual-dialogue feature: two characters
speaking simultaneously, marked by a trailing `^` on the second
character line, rendered side-by-side in the PDF.

```
BRICK
Screw retirement.

STEEL ^
Screw retirement.
```

The caret on `STEEL` says "this dialogue runs in parallel with the one
immediately before it." The first dialogue carries no marker.

## AST representation

We split the responsibility across two fields on `Dialogue`:

- **`caretRange: Range | null`** — set by the parser. Points at the
  `^` character itself (not the surrounding whitespace). Always
  populated whenever the source had a caret, regardless of whether the
  caret ended up creating a valid pair. This is the *source-of-truth*
  field — it round-trips with the original text and is what the editor
  highlighter reads.
- **`dual: boolean`** — set by `applyDualPairing` in the
  `FountainScript` constructor. Means "this dialogue is the first or
  second member of a rendered side-by-side pair." This is the
  *rendering* field — readonly view and PDF read it.

Why two fields? The `^` and the rendering decision aren't the same
thing:

- A caret without a viable predecessor (orphan, non-dialogue before,
  caret on the first dialogue) doesn't form a pair, so it shouldn't
  trigger column rendering. But the `^` is still in the source — the
  editor should still know about it (to dim/style it, to let the
  writer see "you typed `^` but it had no effect"), and the AST should
  still be able to reproduce it. Conflating the two would force a
  tri-state (`"yes" | "no" | "invalid"`) or lose the source.
- A `dual: true` dialogue, conversely, satisfies a clean invariant:
  *its immediate sibling in `script` is also a `Dialogue` with
  `dual: true`*. Renderers can rely on this without look-ahead helpers
  or grouping wrappers.

The element list stays homogeneous (no new `FountainElement` kind). No
grouping helper is needed at render time.

The `^` itself is **not** part of the character source range — the
parser strips it the same way `extractTransitionText` strips the `>`
prefix from forced transitions. A `Dialogue` whose `characterRange`
slice is `STEEL` (no caret, no trailing whitespace), with
`caretRange != null` and `dual: true` (if paired), is the goal.

### Alternatives considered

- **Single boolean `dual` = "I have a caret"** + grouping helper at
  render time. Simpler parser; renderer needs `groupDialoguePairs`.
  Rejected because it bakes the same logic into every renderer
  (look-back to decide pairing) instead of computing it once.
- **Wrapper element `DualDialogue { left, right }`**. New
  `FountainElement` kind; every switch statement in the codebase
  (snippets, removal, structure, edits, scene navigation, CodeMirror
  decorations) has to learn it. Rejected.
- **Tri-state `dual: "yes" | "no" | "invalid"`**. Encodes the orphan
  case in `dual` itself. Loses the *position* of the `^` (no range),
  so the editor highlighter has to scan the source. Rejected; explicit
  `caretRange` is cleaner.

## Parser changes

Current rules in `src/fountain/parser.peggy`:

```peggy
Dialogue
 = OptionalBlanks character:Character [ \t]* exts:CharacterExtensions "\n"
  content:DialogueContent
 { return mkDialogue(range(), character, exts, content); }

CharacterExtensions
 = ([ \t]* "(" [^)\n]* ")")*  { return range() }
```

Add an optional caret marker after the extensions, before the newline.
The marker captures the `^` *only* (not the surrounding whitespace),
so `caretRange` is a tight one-character range:

```peggy
Dialogue
 = OptionalBlanks character:Character [ \t]* exts:CharacterExtensions
   caret:DualMarker? "\n"
   content:DialogueContent
 { return mkDialogue(range(), character, exts, content, caret); }

DualMarker
 = [ \t]* "^" [ \t]* { /* see below */ }
```

For the `DualMarker` action, we want to return only the range of the
`^` character, not the surrounding whitespace. Easiest way: capture
the position of `^` directly via a labeled inner pattern:

```peggy
DualMarker
 = [ \t]* caret:$"^" [ \t]* { return mkRange(location(caret)); }
```

(or whatever syntax peggy uses — verify when implementing). Effectively
`caretRange.end - caretRange.start === 1`.

`mkDialogue` and the `Dialogue` type gain one field:
`caretRange: Range | null`. The post-pass adds `dual: boolean`
afterwards (initially set to `false`; the post-pass mutates as needed).

The spec says "the caret must be the last character on the line" —
read strictly, that forbids trailing whitespace. Highland is lenient
and accepts it, and we match Highland: trailing whitespace after the
`^` is invisible and writers paste it in by accident, so flipping the
semantics from "dual dialogue" to "regular character whose name ends
in `^   `" on the basis of an invisible space would be a hostile UX.

`BRICK ^`, `BRICK^`, `BRICK (V.O.) ^`, and `BRICK (V.O.)^   ` all parse
with `caretRange != null`. Spaces and tabs between the name (or its
extensions) and the caret, and after the caret, are all ignored.

### Ambiguity check

The regular character predicate (`/[A-Za-z]/.test(name) &&
name.toUpperCase() === name`) accepts `BRICK^` as a single character
name (`^` is not a letter, so uppercasing leaves it unchanged). After
the change, the parser will try `Dialogue` first with the new caret
suffix; if that fails it falls through to action. We need a regression
test that `BRICK^\nHi.\n` parses with `caretRange != null` and
`characterRange` covering only `BRICK`.

## Post-pass: `applyDualPairing`

Lives in `src/fountain/script.ts` (or a new `src/fountain/dialogue.ts`),
called from the `FountainScript` constructor right after
`mergeConsecutiveActions`. Pure structural mutation: takes
`FountainElement[]`, returns `FountainElement[]` with `dual` flags
populated.

Algorithm (greedy left-to-right, "predecessor must be unpaired"):

```ts
for (let i = 0; i < script.length; i++) {
  const el = script[i];
  if (el.kind !== "dialogue" || el.caretRange == null) continue;
  const prev = i > 0 ? script[i - 1] : undefined;
  if (prev?.kind === "dialogue" && !prev.dual) {
    prev.dual = true;
    el.dual = true;
  }
  // else: orphan caret, leave dual=false
}
```

The invariant after the post-pass: for every `Dialogue` with
`dual: true`, exactly one of its immediate siblings (previous *or*
next) in `script` is also a `Dialogue` with `dual: true`.

## Renderer changes

### Readonly view (`src/views/reading_view.ts:45-90`)

Today `renderDialogue` emits a single `<div class="dialogue">` with
character heading + lines stacked vertically. For a dual pair we want a
flex container with two columns:

```html
<div class="dialogue-dual">
  <div class="dialogue dialogue-dual-left">…</div>
  <div class="dialogue dialogue-dual-right">…</div>
</div>
```

Driven by the `dual` invariant: when iterating elements, if the
current is a `Dialogue` with `dual: true`, peek at the next; if it's
also a `Dialogue` with `dual: true`, consume both and emit the dual
container. Otherwise emit a normal `Dialogue`. (No grouping helper —
the invariant is local.)

CSS goes in `core_styles.css`:

```css
.dialogue-dual { display: flex; gap: 1em; align-items: flex-start; }
.dialogue-dual > .dialogue { flex: 1 1 0; }
```

Existing per-line styling (character, words, parenthetical) is reused
inside each column without changes.

### PDF (`src/pdf/`)

Two-column dialogue blocks are the most involved piece. Current layout
constants in `src/pdf/types.ts:130-134`:

```
CHARACTER_INDENT = 288    // ~4"
DIALOGUE_INDENT = 180     // 2.5"
PARENTHETICAL_INDENT = 234 // 3.25"
```

Industry-standard dual-dialogue layout (Highland, Final Draft):

| Element | Left column | Right column |
|---|---|---|
| Character | ~2" from left margin | ~5" from left margin |
| Dialogue | left margin (~1.5") | ~4" from left margin |
| Parenthetical | ~2.25" from left margin | ~4.5" from left margin |
| Width | ~2.5" | ~2.5" |

Concretely, add to `src/pdf/types.ts`:

```ts
export const DUAL_LEFT_CHARACTER_INDENT = 156;   // ~2.2"
export const DUAL_LEFT_DIALOGUE_INDENT = 108;    // 1.5" (= MARGIN_LEFT)
export const DUAL_LEFT_PARENTHETICAL_INDENT = 132;
export const DUAL_RIGHT_CHARACTER_INDENT = 372;  // ~5.2"
export const DUAL_RIGHT_DIALOGUE_INDENT = 324;
export const DUAL_RIGHT_PARENTHETICAL_INDENT = 348;
export const DUAL_COLUMN_WIDTH_CHARS = 25;       // narrower than single-column 35
```

Plumbing inside `src/pdf/instruction_generator.ts`:

- The dialogue case in `generateDialogueInstructions` checks
  `el.dual`. If true and the next element is also a `dual: true`
  Dialogue, dispatch to dual-pair emission and skip the next element
  in the outer loop. Otherwise emit single-column as today.
- `emitDialogueOnCurrentPage(instructions, state, prepared)` becomes
  parameterized by a *layout profile* (single-column vs. dual-left vs.
  dual-right) — passed as a `DialogueLayout` argument. Most of the body
  is unchanged; only the indent constants vary.
- New `emitDualDialogueOnCurrentPage(state, leftPrepared, rightPrepared)`
  emits both columns interleaved line-by-line so they share a single
  vertical position. The advance is `max(leftLineCount, rightLineCount)`
  rather than each column advancing independently. (This is the only
  place the layout differs structurally.)
- Page-break splitting: for v1, *don't split* a dual pair across pages.
  If both columns combined don't fit, eject to a new page. Splitting is
  hard (each column may break at a different line; (MORE)/(CONT'D) on
  one side but not the other) and rare. Defer.
- `prepareDialogueData` needs a column-width parameter so each column
  wraps at the narrower width. Currently text wrapping uses a single
  global character count.

### CodeMirror (`src/codemirror/editor.ts:172-194`)

Use `caretRange`, not `dual`. The editor styles every `^` the user
typed, regardless of whether it ended up forming a pair — orphan
carets get the same dim styling, which is *desirable* (tells the
writer "yes, your caret was registered, but it had no effect").

Add a `.dialogue-dual-marker` decoration class anchored at
`caretRange`, with a CSS rule that dims it (subtle muted color, not
visually loud).

If we want the editor to show the side-by-side layout while editing,
that's a much bigger lift (CM's line-based decoration model doesn't
naturally express two-column flow). Skip for v1; the readonly view and
PDF are the canonical visual representations.

## Edge cases

All resolved by the post-pass + `caretRange`/`dual` split:

1. **Orphan caret on first/only dialogue**: parser sets `caretRange`,
   post-pass leaves `dual = false`. Renderer emits a normal solo
   dialogue. Editor dims the `^`. No warning.
2. **Three-in-a-row** (`A`, `B^`, `C^`): post-pass pairs `(A, B)`
   greedily. At `C`: predecessor `B` is already `dual: true`, so the
   "predecessor must be unpaired" guard refuses; `C.dual` stays false.
   `caretRange` on `C` is preserved (so the editor still dims the
   useless `^`). Final state: `(A, B)` is a dual pair, `C` renders
   solo. This is what Highland appears to do; verify when
   implementing.
3. **Non-dialogue between** (`Action.\n\nSTEEL ^\n…`): predecessor is
   `Action`, not a `Dialogue`, so post-pass leaves `STEEL.dual = false`.
   Renders solo. Per spec, character lines need a blank line before;
   if the writer wanted them paired they'd put them adjacent.
4. **Hide-character filter** (`removal_commands.ts`): the filter
   produces a new `FountainElement[]`, which is passed to the
   `FountainScript` constructor — the post-pass *re-runs* on the
   filtered list. If the first of a pair is removed, the second's
   `dual` flag is recomputed: predecessor is now whatever was before
   the removed dialogue, not a Dialogue, so the surviving half becomes
   solo. The `caretRange` is unchanged (still points at the `^`), so
   the editor still dims it.
5. **Snippets**: a snippet starting at `STEEL ^\n…` retains the `^` in
   source. When the snippet is dragged into another script, the
   document is re-parsed and the post-pass runs on the new state.
   `STEEL` becomes orphan → solo. Writer can delete the `^` if they
   didn't want it.
6. **Index cards**: cards group by scene heading; dual-dialogue pairs
   live inside a scene and don't affect card boundaries.
7. **Edit pipeline**: edits operate on byte ranges; nothing
   dual-aware needed. Re-parse + post-pass picks up the new state.
8. **Direct AST mutation** (no re-parse): could break the invariant.
   Document `dual` as "computed by `applyDualPairing` in the
   `FountainScript` constructor; rerun if you mutate `script` in
   place." In practice we always go through the constructor, but a
   comment guards against future mistakes.

## Round-trip property

`caretRange` (parser-set, source-truth) preserves source recoverability:
the AST encodes "the user typed `^` here" without consulting
`document`. `dual` (post-pass-set, rendering-truth) is derived from
neighbor structure and intentionally lossy on orphan carets — it's a
rendering decision, not a source fact.

This is the same pattern as `scene.heading` / `scene.forced` /
`scene.range` for forced scenes: the rendered text is in `heading`,
the "user typed `.`" fact is in `forced`, and the source is
recoverable from the element range.

See `design/ast_roundtrip_audit.md` for the broader question of
making "every syntactically-significant span has a range" a stated
project invariant.

## Implementation order

1. **Parser + AST**. Add `caretRange` field to the `Dialogue` type and
   `mkDialogue`. Update `parser.peggy` with `DualMarker`. Regen.
   Unit tests for: caret with/without space, with/without extensions,
   orphan caret, three-in-a-row, character range excludes the `^`,
   `caretRange` covers exactly the `^` byte.
2. **Post-pass** `applyDualPairing` in `src/fountain/script.ts`.
   Wired into the `FountainScript` constructor after
   `mergeConsecutiveActions`. Add `dual: boolean` field.
   Unit tests for: pairing, orphan, three-in-a-row,
   non-dialogue-between, removal-driven re-pairing.
3. **Readonly view** consumes `dual` to emit `.dialogue-dual` blocks.
   CSS in `core_styles.css`. E2E test (`test/e2e/specs/`) verifies
   side-by-side rendering.
4. **PDF**. Add layout constants, refactor `emitDialogueOnCurrentPage`
   to accept a layout profile, add `emitDualDialogueOnCurrentPage` for
   the interleaved emission, plumb column-width through
   `prepareDialogueData`. Unit tests in `__tests__/pdf_generator.test.ts`
   for: dual pair fits on page, dual pair forced to new page, dual pair
   with one short / one long column, orphan caret renders as solo.
5. **CodeMirror caret styling**. Decoration anchored at `caretRange`
   (not `dual`), one CSS class.
6. **Changelog**. New version (likely 0.33.0 — user-visible feature).

The order is meaningful: parser + post-pass establishes the contract
(source-truth `caretRange`, rendering-truth `dual`); each renderer is
independent after that.

## Tests

Parser (`__tests__/fountain_parser.ts`):

- `BRICK\nLine.\n\nSTEEL ^\nLine.\n` — `STEEL` has `caretRange != null`,
  `caretRange` length is 1, `characterRange` slices to `STEEL`.
- `STEEL^\nLine.\n` — caret without space; same expectations.
- `STEEL (V.O.) ^\nLine.\n` — caret after extensions.
- `^\nLine.\n` — caret without a name; falls through to action (no
  `Character` matched).
- `STEEL ^extra\nLine.\n` — caret not at end of line; *not* a dual
  marker, `STEEL ^extra` is the (full) character name (existing
  predicate accepts it because letters are present and uppercase).

Post-pass (`__tests__/dialogue_pairing.test.ts`, new):

- Pairing case: both elements get `dual: true`.
- Orphan caret: `caretRange != null`, `dual: false`.
- Three-in-a-row: first two paired, third is `caretRange != null` /
  `dual: false`.
- Non-dialogue between: caret-bearing dialogue is solo.
- Re-pairing after removal: simulate removing the first of a pair;
  surviving half has `dual: false` after re-construction.

PDF (`__tests__/pdf_generator.test.ts`):

- Dual pair on one page.
- Dual pair pushed to new page when it doesn't fit (no splitting).
- Orphan caret renders as solo single-column.
- Each column wraps at column width, not full-page width.

E2E (`test/e2e/specs/dual_dialogue.e2e.ts`, new):

- Sample fountain with a dual exchange renders as two side-by-side
  columns in the readonly view.
- Toggle to editor: caret is preserved in source.
- PDF export of the same file produces a two-column block (snapshot
  comparison or visual check).

## Deferred

- **Mid-pair page break.** v1 ejects an over-tall pair to the next
  page. Splitting both columns simultaneously with matching
  (MORE)/(CONT'D) markers on each side is real work and rare in
  practice.
- **More than two-way parallel dialogue.** The Fountain spec is silent;
  we'd be inventing syntax. Wait for demand.
- **Editor side-by-side preview.** CodeMirror's line model doesn't
  support it cleanly; the readonly view and PDF are the canonical
  presentations.
- **Linting/warnings for orphan carets.** The dim caret styling is
  the v1 signal; an explicit warning (sidebar message, etc.) could
  come later if writers report confusion.
