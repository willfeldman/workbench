import { readFileSync } from "node:fs";
import OpenAI from "openai";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !process.env[line.slice(0, i)])
      process.env[line.slice(0, i)] = line.slice(i + 1);
  }
} catch {}
async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  for (const model of [
    process.env.OPENAI_MODEL || "gpt-6-astra",
    process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
  ]) {
    try {
      await client.models.retrieve(model);
      console.log(model + ": accessible");
    } catch (e) {
      console.log(
        model +
          ": " +
          (e instanceof OpenAI.APIError
            ? `${e.status} ${e.code}`
            : "connection failed"),
      );
    }
  }
}
main();
