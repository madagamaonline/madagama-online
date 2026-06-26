// Generic .env upsert: for each KEY named in argv, take its value from process.env
// and set/replace it in .env. Prints only key names, never values. No secrets live
// in this file.
import { readFileSync, writeFileSync, existsSync } from "fs";

const file = ".env";
const keys = process.argv.slice(2);
let text = existsSync(file) ? readFileSync(file, "utf8") : "";

for (const key of keys) {
  const val = process.env[key];
  if (val === undefined) continue;
  const line = `${key}=${val}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : text.replace(/\n*$/, `\n${line}\n`);
}

writeFileSync(file, text);
console.log("Updated .env keys:", keys.join(", "));
