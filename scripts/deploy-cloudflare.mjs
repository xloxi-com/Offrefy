import { spawnSync } from "node:child_process";

const env = { ...process.env, DEPLOY_TARGET: "cloudflare" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const build = spawnSync(npx, ["react-router", "build"], {
  stdio: "inherit",
  env,
  shell: true,
});
if (build.status) process.exit(build.status);

const deploy = spawnSync(npx, ["wrangler", "deploy"], {
  stdio: "inherit",
  env,
  shell: true,
});
process.exit(deploy.status || 0);
