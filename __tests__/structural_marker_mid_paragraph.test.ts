// Pins that structural markers (`#` Section, `=` Synopsis) are
// recognized even when they appear mid-paragraph — i.e., on a line
// that is not preceded by a blank line. Highland behavior: the marker
// is structural-invisible, but it IS recognized as a section/synopsis
// rather than being absorbed into the surrounding action/dialogue.
import { describe, expect, test } from "@jest/globals";
import { parse } from "../src/fountain/parser";

function kinds(src: string): string[] {
  return parse(src, {}).script.map((e) => e.kind);
}

describe("structural markers recognized mid-paragraph", () => {
  test("Section between two action lines (no blank lines)", () => {
    expect(kinds("Foo\n# As section\nBar\n")).toEqual([
      "action",
      "section",
      "action",
    ]);
  });

  test("Synopsis between two action lines (no blank lines)", () => {
    expect(kinds("Foo\n= a synopsis\nBar\n")).toEqual([
      "action",
      "synopsis",
      "action",
    ]);
  });

  test("Section between dialogue and following content", () => {
    // ALICE / Hello. is dialogue; the section after should not be
    // absorbed as another dialogue line. (No trailing blank line so
    // we don't get a trailing empty action — that's a separate
    // concern.)
    expect(kinds("ALICE\nHello.\n# A section\n")).toEqual([
      "dialogue",
      "section",
    ]);
  });

  test("Synopsis between dialogue and following content", () => {
    expect(kinds("ALICE\nHello.\n= a synopsis\n")).toEqual([
      "dialogue",
      "synopsis",
    ]);
  });

  test("User example from CHANGELOG discussion", () => {
    const src = "Foo\n# As section\nBar\n\nBaz\n# Foo\n\nBar\n";
    expect(kinds(src)).toEqual([
      "action",
      "section",
      "action",
      "section",
      "action",
    ]);
  });
});
