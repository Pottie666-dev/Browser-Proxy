const { spawn } = require("node:child_process");

const child = spawn(
  "pnpm",
  [
    "exec",
    "expo",
    "start",
    "--host",
    "lan",
    "--port",
    process.env.PORT || "8081",
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
