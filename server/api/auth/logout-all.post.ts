import { setHeader, setResponseStatus } from "h3";
import { assertSameOrigin } from "../../auth/csrf";
import {
  destroyAllSessions,
  destroySession,
} from "../../auth/session";
import { requireUser } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const user = await requireUser(event);
  const deleted = await destroyAllSessions(user.id);
  await destroySession(event);

  setResponseStatus(event, 200);
  return { deleted };
});
