import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// Initialize Firebase Admin (once)
if (admin.apps.length === 0) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (projectId) {
    admin.initializeApp({ projectId });
  }
}

const UNAUTHORIZED = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Verify Firebase ID token from Authorization header.
 * Returns user UID if valid, or null.
 */
export async function verifyAuth(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Require auth — returns UID or 401 NextResponse.
 *
 * Usage:
 * ```
 * const auth = await requireAuth(req);
 * if (auth instanceof NextResponse) return auth;
 * // auth is UID string
 * ```
 */
export async function requireAuth(req: NextRequest): Promise<string | NextResponse> {
  const uid = await verifyAuth(req);
  if (!uid) return UNAUTHORIZED;
  return uid;
}
