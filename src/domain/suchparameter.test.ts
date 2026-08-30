import { describe, expect, it } from "vitest";
import { einer, text } from "./suchparameter";

describe("Suchparameter", () => {
  it("nimmt bei doppelter Angabe die erste", () => {
    // `/schulen?q=abc&q=def` - vorher ein Serverfehler.
    expect(einer(["abc", "def"])).toBe("abc");
    expect(text(["abc", "def"])).toBe("abc");
  });

  it("reicht einen einfachen Wert durch", () => {
    expect(einer("abc")).toBe("abc");
    expect(text("abc")).toBe("abc");
  });

  it("kommt mit fehlenden und leeren Angaben zurecht", () => {
    expect(einer(undefined)).toBeUndefined();
    expect(text(undefined)).toBe("");
    expect(einer([])).toBeUndefined();
    expect(text([])).toBe("");
  });
});
