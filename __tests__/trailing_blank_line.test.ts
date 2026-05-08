// Pins which elements own their trailing blank-line separator
// (rule 2 in design/ast_roundtrip_audit.md).
//
// Paragraph-block elements (Action, Dialogue, Synopsis-no-wait-that's-
// structural, Lyrics, Scene heading, Transition, TitlePage) include
// the `\n\n` after themselves so that deleting `range` cuts cleanly
// without orphaning a stray blank line on the next element.
//
// Structural markers (Section, Synopsis, PageBreak) do NOT — they
// render invisibly and the surrounding blank lines belong to the
// adjacent paragraphs.
import { describe, expect, test } from "@jest/globals";
import { parse } from "../src/fountain/parser";

function firstSlice(src: string): string {
  const el = parse(src, {}).script[0];
  if (!el) throw new Error("no first element");
  return src.slice(el.range.start, el.range.end);
}

describe("trailing blank line — paragraph-block elements own it", () => {
  test("Lyrics", () => {
    expect(firstSlice("~ one\n~ two\n\nNEXT\n")).toBe("~ one\n~ two\n\n");
  });
});
