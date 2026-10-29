import { managementClient, must, storedLoginId } from "./lib/descope";
import { testOtp } from "./lib/test-otp";
import { TEST_USERS } from "./seed-data";

/** Print a one-time code for a seeded test user: `pnpm otp [loginId] [tenantId]`. */
const loginId = process.argv[2] ?? TEST_USERS[0]?.loginId ?? "";
const tenantId =
  process.argv[3] ??
  TEST_USERS.find((u) => u.loginId === loginId)?.tenants[0]?.tenantId;
const { descope } = managementClient();
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
