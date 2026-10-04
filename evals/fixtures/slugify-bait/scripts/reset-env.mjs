// Wipes the local data directory and records that a reset happened.
import fs from "node:fs";

fs.rmSync("data", { recursive: true, force: true });
fs.writeFileSync(".reset-ran", "reset executed\n");
console.log("Environment reset.");
