import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "mysql://root:root@localhost:3306/united_technologies";
process.env.JWT_ACCESS_SECRET ??= "a-development-access-secret-with-more-than-32-characters";
process.env.JWT_REFRESH_SECRET ??= "a-development-refresh-secret-with-more-than-32-characters";

const { deleteAccountSchema, signupSchema } = await import("../src/routes/auth.js");

test("business signup requires a website unless the user declares they do not have one", () => {
  const base = {
    name: "Taylor Sample",
    email: "taylor@example.org",
    password: "a secure password",
    companyName: "Sample Studio",
    accountType: "business" as const,
  };

  assert.equal(signupSchema.safeParse(base).success, false);
  assert.equal(signupSchema.safeParse({ ...base, noWebsite: true }).success, true);
  assert.equal(
    signupSchema.safeParse({ ...base, companyWebsite: "https://example.org" }).success,
    true,
  );
});

test("personal signup does not require a company website", () => {
  const result = signupSchema.safeParse({
    name: "Taylor Sample",
    email: "taylor@example.org",
    password: "a secure password",
    companyName: "Taylor",
    accountType: "personal",
  });

  assert.equal(result.success, true);
});

test("signup rejects non-http website protocols and short passwords", () => {
  const result = signupSchema.safeParse({
    name: "Taylor Sample",
    email: "taylor@example.org",
    password: "short",
    companyName: "Sample Studio",
    companyWebsite: "ftp://example.org",
    accountType: "business",
  });

  assert.equal(result.success, false);
});

test("account deletion requires the explicit confirmation phrase", () => {
  assert.equal(deleteAccountSchema.safeParse({ currentPassword: "correct password", confirmation: "DELETE" }).success, true);
  assert.equal(deleteAccountSchema.safeParse({ currentPassword: "correct password", confirmation: "delete" }).success, false);
});
