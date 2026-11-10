import { getRequestOrigin } from "../utils/request";
import type { H3Event } from "h3";

/** Canonical public origin for links we email (AUTH_URL wins). */
export function publicOrigin(event: H3Event): string {
  const configured = process.env.AUTH_URL?.trim();
  const origin = configured || getRequestOrigin(event);
  return origin.replace(/\/+$/, "");
}
