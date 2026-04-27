import { rm } from "node:fs/promises";
import { resolve } from "node:path";

await rm(resolve("public"), { recursive: true, force: true });
console.log("Cleaned public/");
