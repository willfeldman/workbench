import { createHash } from "node:crypto";

/** A retry is idempotent only within the project that submitted it. */
export function quotaRequestId(projectId: string, requestId: string) {
  const bytes = createHash("sha256")
    .update(`${projectId}\0${requestId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function dailyRunLimit(value = process.env.WORKSHOP_DAILY_RUN_LIMIT) {
  const limit = Number(value ?? 4);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : 4;
}
