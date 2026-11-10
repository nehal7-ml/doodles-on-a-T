import { Auth } from "@auth/core";
import { sendWebResponse, toWebRequest } from "h3";
import { authConfig } from "../../auth/config";

/**
 * Auth.js catch-all: session, CSRF, sign-out, provider callbacks.
 * Custom email/password routes live next to this file and take precedence.
 */
export default defineEventHandler(async (event) => {
  const response = await Auth(toWebRequest(event), authConfig);
  return sendWebResponse(event, response);
});
