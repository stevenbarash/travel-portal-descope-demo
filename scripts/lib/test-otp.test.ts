import assert from "node:assert/strict";
import { test } from "node:test";
import { testOtp } from "./test-otp";

test("configured Static OTP avoids generating a replacement", async () => {
  assert.equal(
    await testOtp(" 123456 ", async () => {
      throw new Error("must not generate");
    }),
    "123456",
  );
});
test("unconfigured test OTP uses fresh generation and propagates failures", async () => {
  let calls = 0;
  const generate = async () => String(++calls);
  assert.equal(await testOtp(undefined, generate), "1");
  assert.equal(await testOtp("", generate), "2");
  await assert.rejects(
    testOtp(undefined, async () => ""),
    /No test OTP/,
  );
  await assert.rejects(
    testOtp(undefined, async () => {
      throw new Error("unavailable");
    }),
    /unavailable/,
  );
});
