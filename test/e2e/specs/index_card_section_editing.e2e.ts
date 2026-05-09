import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

/** End-to-end tests for the section-editing affordances on the index card
 *  view: pencil rename (depth change + empty-input deletion), vertical
 *  gutter buttons (`+` scene / `#` section), and the `+ section` edge
 *  bars. The drag-drop story is covered by `index_card_moves.e2e.ts`. */

const FILE = "section_editing.fountain";

async function createFile(path: string, contents: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, path: string, contents: string) => {
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) await app.vault.delete(existing);
      await app.vault.create(path, contents);
    },
    path,
    contents,
  );
}

async function deletePath(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, path: string) => {
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing) await app.vault.delete(existing);
  }, path);
}

async function readFile(path: string): Promise<string> {
  return browser.executeObsidian(async ({ app }, path: string) => {
    const f = app.vault.getAbstractFileByPath(path) as any;
    return await app.vault.read(f);
  }, path);
}

async function switchToIndexCards(path: string): Promise<void> {
  await browser.executeObsidian(({ app }, path: string) => {
    app.workspace.iterateAllLeaves((leaf) => {
      const v: any = leaf.view;
      if (v.getViewType?.() !== "fountain") return;
      if (v.file?.path !== path) return;
      if (v.state?.pstate?.mode !== "index-cards") {
        v.state.toggleIndexCards();
      }
    });
  }, path);
}

/** Click the first element matching `selector` inside the named fountain
 *  view's contentEl. Returns whether a match was found. */
async function clickInView(path: string, selector: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app }, path: string, selector: string) => {
      let clicked = false;
      app.workspace.iterateAllLeaves((leaf) => {
        const v: any = leaf.view;
        if (v.getViewType?.() !== "fountain" || v.file?.path !== path) return;
        const el = (v.contentEl as HTMLElement).querySelector<HTMLElement>(
          selector,
        );
        if (el) {
          el.click();
          clicked = true;
        }
      });
      return clicked;
    },
    path,
    selector,
  );
}

/** Count elements matching `selector` inside the named fountain view's
 *  contentEl. */
async function countInView(path: string, selector: string): Promise<number> {
  return browser.executeObsidian(
    ({ app }, path: string, selector: string) => {
      let n = 0;
      app.workspace.iterateAllLeaves((leaf) => {
        const v: any = leaf.view;
        if (v.getViewType?.() !== "fountain" || v.file?.path !== path) return;
        n = (v.contentEl as HTMLElement).querySelectorAll(selector).length;
      });
      return n;
    },
    path,
    selector,
  );
}

async function focusedSummary(): Promise<{
  tag: string;
  cls: string;
  value: string;
  selStart: number;
  selEnd: number;
}> {
  return browser.executeObsidian(() => {
    const a = document.activeElement as HTMLInputElement | null;
    return {
      tag: a?.tagName ?? "",
      cls: a?.className ?? "",
      value: a?.value ?? "",
      selStart: a?.selectionStart ?? -1,
      selEnd: a?.selectionEnd ?? -1,
    };
  });
}

/** Type into the active rename input and dispatch keyup Enter (the
 *  rename handlers commit on `keyup`, not `keydown`). */
async function commitRename(text: string): Promise<void> {
  await browser.executeObsidian((_app, text: string) => {
    const input = document.activeElement as HTMLInputElement;
    if (input?.tagName !== "INPUT") return;
    input.value = text;
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
  }, text);
}

describe("Index card section editing", function () {
  beforeEach(async function () {
    await createFile(FILE, "");
    await obsidianPage.openFile(FILE);
    await browser.pause(300);
    await switchToIndexCards(FILE);
    await browser.pause(300);
  });

  afterEach(async function () {
    await deletePath(FILE);
    await obsidianPage.resetVault();
    await browser.executeObsidian(({ app }) => {
      const leaves: any[] = [];
      app.workspace.iterateAllLeaves((leaf) => {
        if ((leaf.view as any).getViewType?.() === "fountain") {
          leaves.push(leaf);
        }
      });
      for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    });
  });

  it("empty doc shows exactly one dashed + card alongside the section bars", async function () {
    expect(await countInView(FILE, ".screenplay-index-card.dashed")).toBe(1);
    // Both top-of-doc and tail-of-doc bars render so the user has an
    // obvious aim point regardless of cursor position.
    expect(
      await countInView(FILE, ".section-insert-bar"),
    ).toBeGreaterThanOrEqual(2);
  });

  it("clicking + section opens a rename input with the title pre-selected", async function () {
    expect(await clickInView(FILE, ".section-insert-btn")).toBe(true);
    await browser.pause(400);
    const f = await focusedSummary();
    expect(f.tag).toBe("INPUT");
    expect(f.cls).toContain("section");
    expect(f.value).toBe("# New section");
    // Pre-selection should land on the title only, leaving the `# `
    // prefix outside the selection so an Enter-without-typing still
    // commits the same depth.
    expect(f.selStart).toBe(2);
    expect(f.selEnd).toBe(f.value.length);
  });

  it("section rename commits and produces only one dashed + card (no phantom synth)", async function () {
    await clickInView(FILE, ".section-insert-btn");
    await browser.pause(400);
    await commitRename("# Act 1");
    await browser.pause(500);

    expect(await readFile(FILE)).toContain("# Act 1");
    // Pre-fix regression: the parser leaves an empty synthetic section
    // bucket in front of `# Act 1`; before the fix that bucket also
    // surfaced a dashed `+` card, so the user saw two.
    expect(await countInView(FILE, ".screenplay-index-card.dashed")).toBe(1);
    expect(
      await countInView(FILE, ".section-heading-row .section"),
    ).toBe(1);
  });

  it("dashed + card on an empty section auto-focuses the scene rename", async function () {
    await clickInView(FILE, ".section-insert-btn");
    await browser.pause(400);
    await commitRename("# Act 1");
    await browser.pause(500);

    expect(
      await clickInView(FILE, ".screenplay-index-card.dashed"),
    ).toBe(true);
    await browser.pause(500);

    const f = await focusedSummary();
    expect(f.tag).toBe("INPUT");
    expect(f.cls).toContain("scene-heading");
    // Whole placeholder pre-selected so typing replaces it.
    expect(f.selStart).toBe(0);
    expect(f.selEnd).toBe(f.value.length);
  });

  it("vertical + on a scene card auto-focuses the new scene rename", async function () {
    await deletePath(FILE);
    await createFile(
      FILE,
      ["INT. EXISTING - DAY", "", "Existing content.", ""].join("\n"),
    );
    await obsidianPage.openFile(FILE);
    await browser.pause(300);
    await switchToIndexCards(FILE);
    await browser.pause(300);

    expect(
      await clickInView(
        FILE,
        ".insertion-gutter:not(.insertion-gutter-right) .gutter-btn-scene",
      ),
    ).toBe(true);
    await browser.pause(500);

    const f = await focusedSummary();
    expect(f.tag).toBe("INPUT");
    expect(f.cls).toContain("scene-heading");
  });

  it("vertical # on a scene card auto-focuses the new section rename", async function () {
    await deletePath(FILE);
    await createFile(
      FILE,
      ["INT. EXISTING - DAY", "", "Existing content.", ""].join("\n"),
    );
    await obsidianPage.openFile(FILE);
    await browser.pause(300);
    await switchToIndexCards(FILE);
    await browser.pause(300);

    expect(
      await clickInView(
        FILE,
        ".insertion-gutter:not(.insertion-gutter-right) .gutter-btn-section",
      ),
    ).toBe(true);
    await browser.pause(500);

    const f = await focusedSummary();
    expect(f.tag).toBe("INPUT");
    expect(f.cls).toContain("section");
    expect(f.value).toBe("# New section");
  });

  it("empty rename input deletes the section heading line", async function () {
    await deletePath(FILE);
    await createFile(
      FILE,
      ["# Removable", "", "INT. SCENE - DAY", "", "Content.", ""].join("\n"),
    );
    await obsidianPage.openFile(FILE);
    await browser.pause(300);
    await switchToIndexCards(FILE);
    await browser.pause(300);

    expect(
      await clickInView(FILE, ".section-heading-row .pencil-button"),
    ).toBe(true);
    await browser.pause(300);

    await commitRename("");
    await browser.pause(500);

    const onDisk = await readFile(FILE);
    expect(onDisk).not.toContain("# Removable");
    expect(onDisk).toContain("INT. SCENE - DAY");
  });

  it("changing the # prefix in the rename input changes the heading depth", async function () {
    await deletePath(FILE);
    await createFile(
      FILE,
      ["# Top", "", "INT. SCENE - DAY", "", "Content.", ""].join("\n"),
    );
    await obsidianPage.openFile(FILE);
    await browser.pause(300);
    await switchToIndexCards(FILE);
    await browser.pause(300);

    expect(
      await clickInView(FILE, ".section-heading-row .pencil-button"),
    ).toBe(true);
    await browser.pause(300);

    await commitRename("### Top");
    await browser.pause(500);

    const onDisk = await readFile(FILE);
    expect(onDisk).toContain("### Top");
    expect(onDisk).not.toMatch(/^# Top$/m);
  });
});
