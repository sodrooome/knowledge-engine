import { describe, it, expect } from "vitest";
import { splitFrontmatter, extractFrontmatter } from "../src/utils";

describe("splitFormatter and extractFrontmatter", () => {
  // happy path scenario, a standard case which is indexed every file will have
  it("verify it must extracts fontmatter and body when a valid block is visible", () => {
    const raw = `---\ntitle: My Note\ntags: [a, b]\n---\n\n# Body starts here`;
    const result = splitFrontmatter(raw);

    expect(result.frontmatter).toBe("title: My Note\ntags: [a, b]");
    expect(result.body).toBe("# Body starts here");
  });

  // negative path scenario, malformed YAML. not return garbage or null
  it("verify it must throws when the YAML block is malformed", () => {
    const raw = `---\ntitle: [unclosed\n---\n\nBody`;
    expect(() => extractFrontmatter(raw)).toThrow();
  });

  // ensure empty frontmatter block parses to null via the YAML library
  it("verify an empty frontmatter block to an empty object", () => {
    const raw = `---\n---\n\nBody text`;
    const result = extractFrontmatter(raw);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Body text");
  });

  // parsed YAML becomes a real object given by usable callers
  it("verify valid YAML formatter will be resulted into an object", () => {
    const raw = `---\ntitle: My Note\ntags: [systems, design]\n---\n\nBody text`;
    const result = extractFrontmatter(raw);

    expect(result.frontmatter).toEqual({
      title: "My Note",
      tags: ["systems", "design"],
    });
    expect(result.body).toBe("Body text");
  });
});
