import { createApp } from "./app";
import { type Env, EnvError, parseEnv } from "./env";

// Entry point. Fail fast on bad config: a missing Descope project ID should stop boot with a
// readable list of variables, not surface later as 401s on every request.
let env: Env;
try {
  env = parseEnv();
} catch (e) {
  // Config errors print just the message (no stack); anything else is a real bug, so rethrow.
  if (e instanceof EnvError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

createApp(env).listen(env.PORT, () => {
  console.log(`api listening on http://localhost:${env.PORT}`);
});
