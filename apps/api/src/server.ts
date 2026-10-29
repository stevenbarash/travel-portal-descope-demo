import { createApp } from "./app";
import { type Env, EnvError, parseEnv } from "./env";

let env: Env;
try {
  env = parseEnv();
} catch (e) {
  if (e instanceof EnvError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

createApp(env).listen(env.PORT, () => {
  console.log(`api listening on http://localhost:${env.PORT}`);
});
