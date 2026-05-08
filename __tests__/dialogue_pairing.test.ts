import { describe, expect, test } from "@jest/globals";
import type { Dialogue, FountainElement } from "../src/fountain";
import { FountainScript } from "../src/fountain";
import { parse } from "../src/fountain/parser";

function dialogues(elements: FountainElement[]): Dialogue[] {
  return elements.filter((e): e is Dialogue => e.kind === "dialogue");
}

describe("applyDualPairing", () => {
  test("two consecutive dialogues with caret on second form a pair", () => {
    const script = parse("BRICK\nA.\n\nSTEEL ^\nB.\n", {});
    const ds = dialogues(script.script);
    expect(ds).toHaveLength(2);
    expect(ds[0].dual).toBe(true);
    expect(ds[1].dual).toBe(true);
    expect(ds[0].caretRange).toBeNull();
    expect(ds[1].caretRange).not.toBeNull();
  });

  test("orphan caret: predecessor isn't a dialogue", () => {
    const script = parse("Action.\n\nSTEEL ^\nB.\n", {});
    const ds = dialogues(script.script);
    expect(ds).toHaveLength(1);
    expect(ds[0].dual).toBe(false);
    expect(ds[0].caretRange).not.toBeNull();
  });

  test("three in a row: first two paired, third solo", () => {
    const script = parse("A\nfirst.\n\nB ^\nsecond.\n\nC ^\nthird.\n", {});
    const ds = dialogues(script.script);
    expect(ds).toHaveLength(3);
    expect(ds[0].dual).toBe(true);
    expect(ds[1].dual).toBe(true);
    expect(ds[2].dual).toBe(false);
    expect(ds[1].caretRange).not.toBeNull();
    expect(ds[2].caretRange).not.toBeNull();
  });

  test("re-construction recomputes dual when first of a pair is removed", () => {
    const script = parse("BRICK\nA.\n\nSTEEL ^\nB.\n", {});
    const ds = dialogues(script.script);
    expect(ds[0].dual).toBe(true);
    expect(ds[1].dual).toBe(true);

    // Remove the first dialogue and re-construct
    const filtered = script.script.filter((e, i) => i !== 0);
    const rebuilt = new FountainScript(script.document, script.titlePage, filtered);
    const dsRebuilt = dialogues(rebuilt.script);
    expect(dsRebuilt).toHaveLength(1);
    // Surviving half should be solo: predecessor is no longer a dialogue
    expect(dsRebuilt[0].dual).toBe(false);
    // caretRange is preserved (still from parser)
    expect(dsRebuilt[0].caretRange).not.toBeNull();
  });

  test("invariant: if dual=true, an immediate sibling is also dual=true", () => {
    const script = parse(
      "A\nfirst.\n\nB ^\nsecond.\n\nC\nthird.\n\nD ^\nfourth.\n",
      {},
    );
    for (let i = 0; i < script.script.length; i++) {
      const el = script.script[i];
      if (el.kind !== "dialogue" || !el.dual) continue;
      const prev = script.script[i - 1];
      const next = script.script[i + 1];
      const prevIsDual =
        prev !== undefined && prev.kind === "dialogue" && prev.dual;
      const nextIsDual =
        next !== undefined && next.kind === "dialogue" && next.dual;
      expect(prevIsDual || nextIsDual).toBe(true);
    }
  });
});
