import { describe, it, expect } from "vitest";
import { hashString } from "../src/utils";

describe("hashString", () => {
  it("verify it must returns a known SHA-256 digest for a fixed input", () => {
    // known SHA-256 value, hardcoded against silent algorithm changes
    expect(hashString("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("verify it should be deterministic, same input always produces same hash", () => {
    const input = "hello from ryan";
    expect(hashString(input)).toBe(hashString(input));
  });

  it("verify it will produces different hashes for different inputs", () => {
    expect(hashString("foobar")).to.not.toBe(hashString("fobar"));
  });

  it("verify it must handles the empty string from inputs", () => {
    expect(hashString("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("verify is sensitive to whitespaces and name casing", () => {
    expect(hashString("Hello")).not.toBe(hashString("hello"));

    // added whitespaces
    expect(hashString("Hello ")).not.toBe(hashString("Hello"));
  });
});
