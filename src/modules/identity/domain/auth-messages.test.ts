import { describe, expect, it } from "vitest";

import { humanizeAuthError } from "./auth-messages";

describe("humanizeAuthError", () => {
  it("maps invalid credentials to a clear message", () => {
    expect(
      humanizeAuthError({ message: "Invalid login credentials" }),
    ).toMatch(/incorrect/i);
  });

  it("maps existing email registration errors", () => {
    expect(
      humanizeAuthError({ message: "User already registered" }),
    ).toMatch(/already exists/i);
  });

  it("falls back without leaking raw internals", () => {
    expect(humanizeAuthError({ message: "JWT kid unknown xyz" })).toMatch(
      /try again/i,
    );
  });
});
