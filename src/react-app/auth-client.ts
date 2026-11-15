import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";

// Adds the signed query to every POST made on the Allow page, so the Google
// sign-in and the Allow answer carry it.
export const authClient = createAuthClient({
	plugins: [oauthProviderClient()],
});
