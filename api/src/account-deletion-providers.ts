import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { DeletionProviders } from "./account-deletion.js";
import { withDeadline } from "./runtime-deadline.js";

export function createDeletionProviders(options: {
  enabled: boolean; projectId?: string; credentialPath?: string; revenueCatKey: string;
}): DeletionProviders | null {
  if (!options.enabled) return null;
  if (!options.projectId || !options.credentialPath || !options.revenueCatKey) return null;
  // A Render secret file, never a mobile asset or a checked-in credential.
  let credential;
  try {
    const data = JSON.parse(readFileSync(options.credentialPath, "utf8"));
    if (data.project_id !== options.projectId || data.type !== "service_account") return null;
    credential = cert(data);
  } catch { return null; }
  const name = "account-deletion";
  const app = getApps().find(a => a.name === name) ?? initializeApp({ projectId: options.projectId, credential }, name);
  return {
    async deleteCustomer(id) {
      // RevenueCat recommends confirming a successful delete with a subsequent 404.
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
          method: "DELETE", headers: { authorization: `Bearer ${options.revenueCatKey}` },
          redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        await response.body?.cancel();
        if (response.status === 404) return;
        if (!response.ok) throw new Error("customer_deletion_unavailable");
      }
      throw new Error("customer_deletion_not_confirmed");
    },
    async deleteFirebaseUser(uid) {
      try {
        await withDeadline(() => getAuth(app).deleteUser(uid), {}, "Identity deletion", 45_000);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found") throw new Error("identity_deletion_unavailable");
      }
    },
  };
}
