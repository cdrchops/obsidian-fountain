import { describe, expect, test } from "@jest/globals";
import { parse } from "../src/fountain/parser";

/** Pins the synopsis-attachment rule that `script.structure()` enforces:
 *  the first synopsis right after a scene heading attaches to that
 *  scene's `.synopsis`; the first synopsis right after a section heading
 *  (with no scenes yet) attaches to that section's `.synopsis`; otherwise
 *  the synopsis stays as ordinary content. Blank-line actions between
 *  the heading and the synopsis don't disqualify it; non-blank content
 *  does. */

describe("structure(): scene synopsis attachment", () => {
  test("synopsis right after a scene heading attaches to scene.synopsis", () => {
    const script = parse(
      "INT. SCENE - DAY\n\n= Scene synopsis.\n\nAction.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    expect(scene.synopsis).toBeDefined();
    expect(scene.synopsis?.lines[0]).toBeDefined();
  });

  test("the attached synopsis is removed from scene.content", () => {
    const script = parse(
      "INT. SCENE - DAY\n\n= Scene synopsis.\n\nAction.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    const synopsesInContent = scene.content.filter(
      (c) => c.kind === "synopsis",
    );
    expect(synopsesInContent.length).toBe(0);
  });

  test("synopsis after non-blank action stays in scene.content (not attached)", () => {
    const script = parse(
      "INT. SCENE - DAY\n\nAction first.\n\n= Late synopsis.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    expect(scene.synopsis).toBeUndefined();
    const synopsesInContent = scene.content.filter(
      (c) => c.kind === "synopsis",
    );
    expect(synopsesInContent.length).toBe(1);
  });

  test("synopsis after dialogue stays in scene.content (not attached)", () => {
    const script = parse(
      "INT. SCENE - DAY\n\nALICE\nHello.\n\n= Late synopsis.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    expect(scene.synopsis).toBeUndefined();
  });

  test("blank-line actions between heading and synopsis don't disqualify attachment", () => {
    // The blank line between `\n\n` and the synopsis becomes an empty
    // Action element in the source order. The attachment rule treats
    // those as transparent.
    const script = parse(
      "INT. SCENE - DAY\n\n\n\n= Synopsis.\n\nAction.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    expect(scene.synopsis).toBeDefined();
  });

  test("when a synopsis is attached, a later synopsis stays in scene.content", () => {
    // A blank line between two `= …` blocks splits them into two
    // separate Synopsis elements (consecutive `=` lines parse as one).
    const script = parse(
      "INT. SCENE - DAY\n\n= First synopsis.\n\n= Second synopsis.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    expect(scene.synopsis).toBeDefined();
    const synopsesInContent = scene.content.filter(
      (c) => c.kind === "synopsis",
    );
    expect(synopsesInContent.length).toBe(1);
  });

  test("consecutive `=` lines parse as one multi-line synopsis and attach as a unit", () => {
    const script = parse(
      "INT. SCENE - DAY\n\n= First line.\n= Second line.\n\nAction.\n\n",
      {},
    );
    const scene = script.structure().sections[0].content[0];
    expect(scene.synopsis).toBeDefined();
    expect(scene.synopsis?.lines.length).toBe(2);
  });
});

describe("structure(): section synopsis attachment", () => {
  test("synopsis right after a section heading attaches to section.synopsis", () => {
    const script = parse(
      "# Act 1\n\n= Section synopsis.\n\nINT. SCENE - DAY\n\n",
      {},
    );
    const section = script.structure().sections[0];
    expect(section.synopsis).toBeDefined();
    expect(section.synopsis?.lines[0]).toBeDefined();
  });

  test("section synopsis is not also placed on the scene below", () => {
    const script = parse(
      "# Act 1\n\n= Section synopsis.\n\nINT. SCENE - DAY\n\n",
      {},
    );
    const section = script.structure().sections[0];
    // Find the real scene (one with a `.scene` heading) and check its
    // synopsis isn't the section's.
    const realScene = section.content.find((c) => c.scene);
    expect(realScene?.synopsis).toBeUndefined();
  });

  test("synopsis after a scene heading inside a section attaches to the scene, not the section", () => {
    const script = parse(
      "# Act 1\n\nINT. SCENE - DAY\n\n= Synopsis.\n\nAction.\n\n",
      {},
    );
    const section = script.structure().sections[0];
    expect(section.synopsis).toBeUndefined();
    const realScene = section.content.find((c) => c.scene);
    expect(realScene?.synopsis).toBeDefined();
  });

  test("synopsis at start of a doc with no heading stays in content (not attached)", () => {
    // No section heading and no scene heading — there's nowhere for the
    // synopsis to attach, so it remains in content.
    const script = parse("= Floating synopsis.\n\nAction.\n\n", {});
    const sections = script.structure().sections;
    expect(sections[0]?.synopsis).toBeUndefined();
    // The synopsis is in the synth scene's content.
    const allSynopsesInContent = sections
      .flatMap((s) => s.content)
      .flatMap((scene) => scene.content)
      .filter((el) => el.kind === "synopsis");
    expect(allSynopsesInContent.length).toBe(1);
  });

  test("blank-line actions between section heading and synopsis don't disqualify attachment", () => {
    const script = parse(
      "# Act 1\n\n\n\n= Synopsis.\n\nINT. SCENE - DAY\n\n",
      {},
    );
    const section = script.structure().sections[0];
    expect(section.synopsis).toBeDefined();
  });
});
