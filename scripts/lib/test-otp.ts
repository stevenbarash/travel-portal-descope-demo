/**
 * Resolve the OTP for a test user: the configured static code if set, else `generate()`.
 * Server-only: Console Static OTP cannot be inferred from generated-code responses.
 */
export async function testOtp(
  staticOtp: string | undefined,
  generate: () => Promise<string>,
): Promise<string> {
  if (staticOtp?.trim()) return staticOtp.trim();
  const code = await generate();
  if (!code) throw new Error("No test OTP returned");
  return code;
}
