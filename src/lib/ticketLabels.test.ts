import { describe, it, expect } from "vitest";
import { breakdownLabel } from "@/lib/ticketLabels";

describe("breakdownLabel", () => {
  it("describes a member-only order", () => {
    expect(breakdownLabel(1, 0)).toBe("1 ticket at member price");
  });

  it("describes a non-member-only order", () => {
    expect(breakdownLabel(0, 1)).toBe("1 ticket at non-member price");
    expect(breakdownLabel(0, 3)).toBe("3 tickets at non-member price");
  });

  it("joins both halves of a mixed order", () => {
    // The common case: a member buying for themselves plus friends. At most
    // one seat ever gets the member rate.
    expect(breakdownLabel(1, 2)).toBe(
      "1 ticket at member price + 2 tickets at non-member price"
    );
  });

  it("pluralizes on the count, not the total", () => {
    expect(breakdownLabel(0, 1)).toContain("1 ticket at");
    expect(breakdownLabel(0, 2)).toContain("2 tickets at");
  });

  it("returns an empty string when there is nothing to describe", () => {
    expect(breakdownLabel(0, 0)).toBe("");
  });
});
