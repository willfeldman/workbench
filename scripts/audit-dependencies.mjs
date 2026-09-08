import { spawnSync } from "node:child_process";
const r = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
});
try {
  const d = JSON.parse(r.stdout);
  console.log(
    JSON.stringify(
      Object.values(d.vulnerabilities ?? {}).map((v) => ({
        name: v.name,
        severity: v.severity,
        direct: v.isDirect,
        via: v.via.map((x) => (typeof x === "string" ? x : x.title)),
        fix: v.fixAvailable,
      })),
      null,
      2,
    ),
  );
} catch {
  console.log("Audit failed:", r.status);
}
