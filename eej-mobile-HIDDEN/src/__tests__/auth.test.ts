import { describe, it, expect } from "vitest";

/**
 * Tests for the isValidUser logic from auth.tsx.
 * Since isValidUser is not exported, we replicate the validation logic here
 * to test the contract it enforces on the User type.
 */

interface User {
  role: string;
  tier: number;
  designation: string;
  shortName: string;
  name: string;
  email: string;
  candidateId?: string;
}

function isValidUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== "object") return false;
  const u = obj as Record<string, unknown>;
  return (
    typeof u.role === "string" &&
    typeof u.tier === "number" &&
    typeof u.name === "string" &&
    typeof u.email === "string" &&
    typeof u.designation === "string" &&
    typeof u.shortName === "string"
  );
}

describe("isValidUser", () => {
  it("returns true for a valid user object", () => {
    const validUser = {
      role: "executive",
      tier: 1,
      designation: "Executive Board & Finance",
      shortName: "Executive",
      name: "Anna Bondarenko",
      email: "anna.b@edu-jobs.eu",
    };
    expect(isValidUser(validUser)).toBe(true);
  });

  it("returns true for a valid user with optional candidateId", () => {
    const validUser = {
      role: "candidate",
      tier: 4,
      designation: "Worker",
      shortName: "Candidate",
      name: "Mariusz Kowalski",
      email: "mariusz.k@example.com",
      candidateId: "abc-123",
    };
    expect(isValidUser(validUser)).toBe(true);
  });

  it("returns false when name is missing", () => {
    const user = {
      role: "executive",
      tier: 1,
      designation: "Executive",
      shortName: "Exec",
      email: "a@b.com",
    };
    expect(isValidUser(user)).toBe(false);
  });

  it("returns false when role is missing", () => {
    const user = {
      tier: 1,
      designation: "Executive",
      shortName: "Exec",
      name: "Anna",
      email: "a@b.com",
    };
    expect(isValidUser(user)).toBe(false);
  });

  it("returns false when tier is not a number", () => {
    const user = {
      role: "executive",
      tier: "1",
      designation: "Executive",
      shortName: "Exec",
      name: "Anna",
      email: "a@b.com",
    };
    expect(isValidUser(user)).toBe(false);
  });

  it("returns false when email is missing", () => {
    const user = {
      role: "executive",
      tier: 1,
      designation: "Executive",
      shortName: "Exec",
      name: "Anna",
    };
    expect(isValidUser(user)).toBe(false);
  });

  it("returns false when designation is missing", () => {
    const user = {
      role: "executive",
      tier: 1,
      shortName: "Exec",
      name: "Anna",
      email: "a@b.com",
    };
    expect(isValidUser(user)).toBe(false);
  });

  it("returns false when shortName is missing", () => {
    const user = {
      role: "executive",
      tier: 1,
      designation: "Executive",
      name: "Anna",
      email: "a@b.com",
    };
    expect(isValidUser(user)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidUser(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidUser(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isValidUser("not a user")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isValidUser(42)).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isValidUser({})).toBe(false);
  });
});
