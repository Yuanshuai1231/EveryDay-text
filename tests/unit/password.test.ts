import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("local password hashing", () => {
  it("stores a salted scrypt record and verifies the original password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+\$/);
    expect(await verifyPassword("correct horse battery staple", encoded)).toBe(
      true,
    );
    expect(await verifyPassword("incorrect", encoded)).toBe(false);
  });

  it("rejects passwords outside the 8 to 128 character range", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    await expect(hashPassword("x".repeat(129))).rejects.toThrow();
  });

  it("uses a different salt for each stored password", async () => {
    expect(await hashPassword("same-password-value")).not.toBe(
      await hashPassword("same-password-value"),
    );
    expect(await verifyPassword("same-password-value", "bad-record")).toBe(
      false,
    );
  });
});
