import { managementClient, must, storedLoginId } from "./lib/descope";
import { testOtp } from "./lib/test-otp";
import { TEST_USERS } from "./seed-data";

/**
 * Print a one-time code for a seeded test user: `npm run otp [loginId] [tenantId]`. Defaults to
 * the first test user and their first tenant. DESCOPE_TEST_OTP, when set, is printed instead.
 */
const loginId = process.argv[2] ?? TEST_USERS[0]?.loginId ?? "";
const tenantId =
  process.argv[3] ??
  TEST_USERS.find((u) => u.loginId === loginId)?.tenants[0]?.tenantId;
const { descope } = managementClient();
// Under tenant user isolation the stored login ID is tenant-suffixed; resolve the exact value.
const stored = await storedLoginId(descope, loginId, tenantId);
const code = await testOtp(process.env.DESCOPE_TEST_OTP, async () => {
  const res = must(
    await descope.client.management.user.generateOTPForTestUser(
      "email",
      stored,
    ),
    `generateOTPForTestUser(${stored})`,
  );
  return res.data?.code ?? "";
});
console.log(code);
