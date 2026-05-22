import { spawn } from "node:child_process";

const commands = [
  ["pnpm", ["run", "dev:server"]],
  ["pnpm", ["run", "dev:client"]]
];

const children = commands.map(([command, args]) =>
  spawn(command, args, {
    stdio: "inherit",
    env: process.env
  })
);

function stopAll(signal = "SIGTERM") {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
});
process.on("SIGTERM", () => {
  stopAll("SIGTERM");
});

for (const child of children) {
  child.on("exit", (code, signal) => {
    stopAll();
    if (signal) process.kill(process.pid, signal);
    process.exitCode = code ?? 1;
  });
}
