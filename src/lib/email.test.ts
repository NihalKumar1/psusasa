import { describe, it, expect } from "vitest";
import { isPsuEmail, EMAIL_RE } from "@/lib/email";

describe("isPsuEmail", () => {
  it("rejects a bare @psu.edu address as a contact email", () => {
    expect(isPsuEmail("abc1234@psu.edu")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPsuEmail("ABC1234@PSU.EDU")).toBe(true);
    expect(isPsuEmail("abc1234@Psu.Edu")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isPsuEmail("  abc1234@psu.edu  ")).toBe(true);
  });

  it("deliberately allows psu.edu subdomains", () => {
    // Documented carve-out: these are real personal-ish inboxes people use,
    // and the rule only means to block the bare university address.
    expect(isPsuEmail("abc1234@ems.psu.edu")).toBe(false);
    expect(isPsuEmail("abc1234@med.psu.edu")).toBe(false);
  });

  it("allows ordinary personal domains", () => {
    expect(isPsuEmail("someone@gmail.com")).toBe(false);
    expect(isPsuEmail("someone@outlook.com")).toBe(false);
  });

  it("does not match a domain that merely ends in the same letters", () => {
    expect(isPsuEmail("someone@notpsu.edu")).toBe(false);
    expect(isPsuEmail("someone@psu.edu.example.com")).toBe(false);
  });

  it("does not match psu.edu appearing in the local part", () => {
    expect(isPsuEmail("psu.edu@gmail.com")).toBe(false);
  });
});

describe("EMAIL_RE", () => {
  it("accepts ordinary addresses", () => {
    expect(EMAIL_RE.test("someone@gmail.com")).toBe(true);
    expect(EMAIL_RE.test("first.last+tag@sub.domain.org")).toBe(true);
  });

  it("rejects addresses missing a domain, an @, or a dot", () => {
    expect(EMAIL_RE.test("someone@")).toBe(false);
    expect(EMAIL_RE.test("someone.gmail.com")).toBe(false);
    expect(EMAIL_RE.test("someone@localhost")).toBe(false);
    expect(EMAIL_RE.test("")).toBe(false);
  });

  it("rejects addresses containing whitespace", () => {
    expect(EMAIL_RE.test("some one@gmail.com")).toBe(false);
    expect(EMAIL_RE.test("someone@gmail .com")).toBe(false);
  });
});
