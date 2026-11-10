import { setHeader, setResponseStatus } from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import { destroySession } from "../../auth/session";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  await destroySession(event);
  setResponseStatus(event, 204);
  return null;
});
