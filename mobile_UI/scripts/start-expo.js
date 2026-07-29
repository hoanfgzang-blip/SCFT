const { spawn } = require("node:child_process");
const path = require("node:path");

const expoCli = path.join(__dirname, "..", "node_modules", "expo", "bin", "cli");
const extraArgs = process.argv.slice(2);
const nodeOptions = process.env.NODE_OPTIONS || "";
const hasHostArg = extraArgs.some((arg) => ["--localhost", "--lan", "--tunnel"].includes(arg) || arg === "--host" || arg.startsWith("--host="));

process.env.NODE_OPTIONS = `${nodeOptions} --max-old-space-size=4096`.trim();
process.env.EXPO_NO_TELEMETRY = "1";

const args = [
  expoCli,
  "start",
  ...(hasHostArg ? [] : ["--lan"]),
  "--clear",
  "--max-workers",
  "2",
  ...extraArgs
];

const child = spawn(process.execPath, args, {
  cwd: path.join(__dirname, ".."),
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
