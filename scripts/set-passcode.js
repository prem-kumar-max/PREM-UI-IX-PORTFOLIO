import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputPath = fileURLToPath(new URL("../src/data/adminPasscode.js", import.meta.url));

function readHiddenPasscode() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run npm run set-passcode from an interactive terminal.");
  }
  return new Promise((resolve, reject) => {
    process.stdout.write("Enter the admin passcode: ");
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Passcode setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

try {
  const passcode = await readHiddenPasscode();
  if (!passcode) throw new Error("Passcode cannot be empty.");
  const hash = createHash("sha256").update(passcode, "utf8").digest("hex");
  await writeFile(outputPath, `export const adminPasscodeHash = ${JSON.stringify(hash)};\n`, "utf8");
  process.stdout.write("Admin passcode hash saved to src/data/adminPasscode.js.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
