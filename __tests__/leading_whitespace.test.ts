// Pins the leading-whitespace behavior of every line-based element.
// Rules documented in src/fountain/types.ts (rule 2).
//
// These tests exist because the same coverage was previously implicit
// across dozens of unrelated tests — refactors could drop it without
// signaling. Centralizing here makes the contract explicit.
//
// Key distinction:
// - "Allows leading whitespace" → element parses the same with or
//   without leading ws, and the ws is part of the element's range.
// - "Requires column 0" → the marker (`!`, `>`, `~`) must be at
//   column 0 per the Fountain spec; leading whitespace causes the
//   parser to fall through to a different element type (typically
//   plain Action).
import { describe, expect, test } from "@jest/globals";
import { parse } from "../src/fountain/parser";

function firstKind(src: string): string {
  return parse(src, {}).script[0]?.kind ?? "<empty>";
}

function firstRange(src: string): { start: number; end: number } {
  const el = parse(src, {}).script[0];
  if (!el) throw new Error("no first element");
  return el.range;
}

describe("leading whitespace — allowed (range starts at column 0)", () => {
  test("Scene heading", () => {
    expect(firstKind("  INT. HOUSE - DAY\n\n")).toBe("scene");
    expect(firstRange("  INT. HOUSE - DAY\n\n").start).toBe(0);
  });

  test("Unforced Transition (… TO:)", () => {
    expect(firstKind("  FADE TO:\n\n")).toBe("transition");
    expect(firstRange("  FADE TO:\n\n").start).toBe(0);
  });

  test("Centered Action (> … <)", () => {
    expect(firstKind("  > centered <\n\n")).toBe("action");
    expect(firstRange("  > centered <\n\n").start).toBe(0);
  });

  test("Dialogue character line", () => {
    expect(firstKind("  ALICE\nHello.\n\n")).toBe("dialogue");
    expect(firstRange("  ALICE\nHello.\n\n").start).toBe(0);
  });

  test("Plain action — leading ws is folded into the line text", () => {
    // Plain action has no marker; leading whitespace is part of the
    // action text content, not a separator.
    expect(firstKind("  some action\n\n")).toBe("action");
    expect(firstRange("  some action\n\n").start).toBe(0);
  });
});

describe("leading whitespace — requires column 0 (parser falls through)", () => {
  // For each forced marker, we assert that adding leading whitespace
  // does NOT produce that element type — the parser must reject the
  // indented form and fall through to plain Action. This pins the
  // spec-compliant behavior so a refactor can't silently make the
  // parser too permissive.

  test("Forced Action (!) — col 0 is the marker; indented becomes plain action", () => {
    expect(firstKind("!forced\n\n")).toBe("action");
    // With leading ws, the `!` is no longer a forced marker — it's
    // just text in a plain action line. The element is still kind
    // "action" but the `!` does not denote forcing.
    const indented = parse("  !not forced\n\n", {});
    const el = indented.script[0];
    expect(el?.kind).toBe("action");
    // If a future refactor introduced a forced range/flag, indenting
    // past column 0 must not set it.
  });

  test("Forced Transition (>) — col 0; indented becomes action", () => {
    // Use "JUMP CUT" (no `TO:`) so the indented form can't accidentally
    // match the unforced `… TO:` transition rule. With `> CUT TO:`
    // indented, the parser falls through to unforced transition because
    // "TO:" + all-uppercase still matches; that's a separate quirk of
    // the unforced rule, not a leading-whitespace property of `>`.
    expect(firstKind("> JUMP CUT\n\n")).toBe("transition");
    expect(firstKind("  > JUMP CUT\n\n")).toBe("action");
  });

  test("Lyrics (~) — col 0; indented becomes action", () => {
    expect(firstKind("~ a lyric\n\n")).toBe("lyrics");
    expect(firstKind("  ~ a lyric\n\n")).toBe("action");
  });

  test("Section (#) — col 0; indented becomes action", () => {
    expect(firstKind("# Act One\n\n")).toBe("section");
    expect(firstKind("  # Act One\n\n")).toBe("action");
  });

  test("Synopsis (=) — col 0; indented becomes action", () => {
    expect(firstKind("= a synopsis\n\n")).toBe("synopsis");
    expect(firstKind("  = a synopsis\n\n")).toBe("action");
  });

  test("PageBreak (===) — col 0; indented does not parse as page break", () => {
    expect(firstKind("===\n\n")).toBe("page-break");
    // Indented `===` falls through to Synopsis, which also has its
    // own leading-ws permissiveness (`  =text` is a synopsis with
    // `=text` as content). The thing being pinned here is that
    // PageBreak rejects leading ws — what it falls through to is
    // a separate concern.
    expect(firstKind("  ===\n\n")).not.toBe("page-break");
  });
});
