/** Unicode non breaking space. Use this instead of &nbsp; so we don't need to set innerHTML */
export const NBSP = "\u00A0";

export type ShowHideSettings = {
  hideSynopsis?: boolean; // undefined also false
  hideNotes?: boolean; // undefined also false
  hideBoneyard?: boolean; // undefined also false
};

// ============================================================================
// Range
// ============================================================================

export interface Range {
  start: number;
  end: number;
}

export function dataRange(r: Range): { "data-range": string } {
  return { "data-range": `${r.start},${r.end}` };
}

export function intersect(r1: Range, r2: Range): boolean {
  return r1.start < r2.end && r2.start < r1.end;
}

export function collapseRangeToStart(r: Range): Range {
  return { start: r.start, end: r.start };
}

export function computeRange(...optionalRanges: (Range | undefined)[]): Range {
  const starts = optionalRanges
    .map((r) => r?.start)
    .filter((s): s is number => s !== undefined);
  const ends = optionalRanges
    .map((r) => r?.end)
    .filter((e): e is number => e !== undefined);
  return { start: Math.min(...starts), end: Math.max(...ends) };
}

// ============================================================================
// Text Element Types
// ============================================================================

/// The type of a piece of text. Text never contains any newlines!
export type BasicTextElement = {
  range: Range;
  kind: "text";
};

// TODO (rule 1): if the editor wants to dim the `*`/`**`/`_`
// markers separately from the styled text inside them, add explicit
// `openMarker`/`closeMarker` ranges. Today they live inside `range`
// but aren't broken out.
export type StyledTextElement = {
  range: Range;
  kind: "bold" | "italics" | "underline";
  elements: StyledText;
};

export type TextElement = BasicTextElement | StyledTextElement;

export type StyledText = TextElement[];

export type Note = {
  kind: "note";
  noteKind: string;
  range: Range;
  textRange: Range;
};

export type Boneyard = {
  kind: "boneyard";
  range: Range;
};

export type TextElementWithNotesAndBoneyard =
  | BasicTextElement
  | StyledTextElement
  | Note
  | Boneyard;

export type StyledTextWithNotesAndBoneyard = TextElementWithNotesAndBoneyard[];

export type Line = {
  range: Range;
  elements: TextElementWithNotesAndBoneyard[];
  centered: boolean;
};

// ============================================================================
// Fountain AST Element Types
// ============================================================================
//
// Three rules govern how AST nodes relate to source positions. They
// guide future syntax additions and refactors. Pinned by tests in
// __tests__/{leading_whitespace,trailing_blank_line,
// structural_marker_mid_paragraph}.test.ts.
//
// RULE 1 — Every significant span has a range. If a piece of source
// text is syntactically significant *and* its position isn't trivially
// derivable from the element's range plus a fixed-length marker, give
// it a `Range` field. Consumers shouldn't have to scan `document` for
// "where's the `^` of this dual dialogue?". Carve-out: `#` (Section,
// length = `depth`) and `===` (PageBreak) live at known offsets inside
// `range` and don't need separate fields.
//
// RULE 2 — Line-based elements own their lines. For elements that
// introduce paragraph spacing (Action, Dialogue, Lyrics, Scene
// heading, Transition, TitlePage), `range` covers from column 0 of
// the first line (including any leading whitespace) through the end
// of the trailing blank-line separator (or to EOF if last). Inline
// elements (notes, styled text, parentheticals) keep tight ranges
// around the syntax itself.
//
// Invariant: deleting `range` from `document` removes the element
// cleanly — no orphan whitespace, no stray blank lines. Trailing
// blank lines belong to the element that ends, not the one that
// starts, so adjacent elements never overlap or leave gaps.
//
//   Structural-marker carve-out: `Section`, `Synopsis`, and
//   `PageBreak` render as invisible structural markers (Highland
//   confirms — surrounding action paragraphs flow as if they
//   weren't there). Their `range` covers only the marker line.
//   Adjacent blank lines belong to the surrounding paragraph
//   context, not to the marker.
//
// RULE 3 — Optional markers as `Range | null`, never alongside a
// boolean. The range existing is the signal that the marker is
// present (mirrors how `Dialogue.caretRange` works). Don't carry
// both a `forced: boolean` AND a range — two sources of truth that
// can drift. The `forced: boolean` fields on `SceneHeading` and
// `Transition` are debt to replace when a feature actually needs the
// range (see TODOs on those types).
export type PageBreak = {
  kind: "page-break";
  range: Range;
};

/** A synopsis is some text soley for the writer of the document.
 Often used to summarize the key points of a scene before the scene
 is written. `lines` is one element per source line. Each line's range
 excludes the leading '=' and the trailing newline; line elements may
 include styled text (bold/italic/underline), notes (incl. `[[>...]]`
 links and `[[@marker]]` margin marks), and boneyard.
*/
export type Synopsis = {
  kind: "synopsis";
  range: Range;
  lines: Line[];
};

export type Action = {
  kind: "action";
  range: Range;
  lines: Line[];
};

export type SceneHeading = {
  kind: "scene";
  range: Range;
  heading: string;
  // TODO: replace with `forcedMarker: Range | null` per rule 3 when a
  // feature needs the range. The `.` of a forced scene heading lives
  // inside `range` but isn't separately broken out.
  forced: boolean;
  number: Range | null;
};

export type Transition = {
  kind: "transition";
  range: Range;
  // TODO: replace with `forcedMarker: Range | null` per rule 3 when a
  // feature needs the range. The `>` of a forced transition lives
  // inside `range` but isn't separately broken out;
  // `extractTransitionText` strips it via string trimming.
  forced: boolean;
};

export type DialogueContentParenthetical = {
  kind: "parenthetical";
  range: Range;
};

export type DialogueContentLine = {
  kind: "line";
  line: Line;
};

export type DialogueContent = DialogueContentParenthetical | DialogueContentLine;

export type Dialogue = {
  kind: "dialogue";
  range: Range; /// range of everything
  /// Range of the character name (excluding leading whitespace, the
  /// optional `@` forced-character marker, extensions, and the dual
  /// `^`). Slicing this range yields exactly the displayable character
  /// name — preview/PDF/editor highlights/`charactersOf` all rely on
  /// that. The marker position lives separately on `forcedMarkerRange`.
  characterRange: Range;
  /// Range of the `@` forced-character marker if present in source.
  /// Following rule 3: the range existing is the signal that the marker
  /// is present (no parallel boolean). Covers exactly the `@`. The Fountain
  /// spec treats `@` as a parser-only hint — it must not appear in
  /// rendered output, so `characterRange` deliberately excludes it.
  forcedMarkerRange: Range | null;
  characterExtensionsRange: Range; /// range of all extensions (empty range if no extensions) including all parentheses
  content: DialogueContent[];
  /// Range of the `^` dual-dialogue marker if present in source. Always set
  /// by the parser whenever the source had a caret, regardless of whether
  /// it formed a valid pair. The range covers exactly the `^` character.
  /// Splitting the source-truth (`caretRange`) from the rendering-truth
  /// (`dual`) avoids a tri-state and lets the editor highlight orphan
  /// carets without losing the position of the `^`.
  caretRange: Range | null;
  /// Whether this dialogue renders as part of a side-by-side pair. Set by
  /// `applyDualPairing` in the FountainScript constructor (not the parser).
  /// Invariant: if `dual` is true, exactly one immediate neighbor in
  /// `script` is also a Dialogue with `dual: true`.
  dual: boolean;
};

export type Section = {
  kind: "section";
  range: Range;
  depth: number;
};

export type Lyrics = {
  kind: "lyrics";
  range: Range;
  lines: Line[];
};

export type FountainElement =
  | Synopsis
  | Transition
  | Action
  | SceneHeading
  | Dialogue
  | Section
  | Lyrics
  | PageBreak;

/// `range` covers the full `Key: value` block including the value's
/// trailing newline. `key` lives at a fixed offset:
/// `range.start..range.start + key.length`.
export type KeyValue = {
  key: string;
  values: StyledText[];
  range: Range;
};

/// A title page is a block of `Key: value` lines followed by a
/// blank-line separator. `range` covers the entire block including
/// that trailing blank line, so deleting `range` from `document`
/// removes the title page cleanly.
export type TitlePage = {
  keyValues: KeyValue[];
  range: Range;
};

// ============================================================================
// Snippets and Structure
// ============================================================================

export interface Snippet {
  content: FountainElement[];
  pageBreak?: PageBreak;
}
export type Snippets = Snippet[];

export interface ScriptStructure {
  sections: StructureSection[];
  snippets: Snippets;
}

// ============================================================================
// Structure Classes
// ============================================================================

export class StructureSection {
  /** Sections never nest other sections in this model. Section *depth*
   *  in Fountain is the count of `#`s the writer typed — and writers
   *  don't always type a well-formed hierarchy (a doc that opens with
   *  `### Act 1` has no surrounding `##`/`#` to nest under, two `##`
   *  in a row aren't necessarily siblings of any one parent, etc.).
   *  Since depth doesn't imply structure, we can't build a tree from
   *  it without imposing a shape the source doesn't say is there.
   *
   *  So every depth-≤-3 heading is a top-level sibling in
   *  `ScriptStructure.sections`; the visual hierarchy is purely the
   *  `<h{depth}>` rendering. Depth-≥-4 headings flow into
   *  `scene.content` as scene-internal subsections by convention. */
  readonly content: StructureScene[];
  readonly kind: "section";

  constructor(
    public section?: Section,
    public synopsis?: Synopsis,
  ) {
    this.kind = "section";
    this.content = [];
  }

  get range(): Range {
    return computeRange(
      this.section?.range,
      this.synopsis?.range,
      this.content[0]?.range,
      this.content[this.content.length - 1]?.range,
    );
  }
}

export class StructureScene {
  readonly kind: "scene";
  readonly content: Exclude<FountainElement, SceneHeading>[];

  constructor(public scene?: SceneHeading) {
    this.content = [];
    this.kind = "scene";
  }

  /** First synopsis in `content` that qualifies as *the* scene synopsis:
   *  reached by skipping blank-line actions only. Mirrors how Highland
   *  treats the synopsis directly under a scene heading. Returns
   *  undefined when the scene has no qualifying synopsis (e.g. action
   *  appeared first, or the scene has no synopsis at all). */
  get synopsis(): Synopsis | undefined {
    for (const el of this.content) {
      if (el.kind === "synopsis") return el;
      if (el.kind === "action" && el.lines.every((l) => !l.elements.length)) {
        continue;
      }
      return undefined;
    }
    return undefined;
  }

  /** `content` with the qualifying synopsis (if any) elided — the
   *  "everything except the synopsis" view that consumers want when
   *  they iterate the scene's body for action / dialogue / todos. */
  get body(): Exclude<FountainElement, SceneHeading>[] {
    const syn = this.synopsis;
    if (!syn) return this.content;
    return this.content.filter((el) => el !== syn);
  }

  get range(): Range {
    return computeRange(
      this.scene?.range,
      this.content[0]?.range,
      this.content[this.content.length - 1]?.range,
    );
  }
}
