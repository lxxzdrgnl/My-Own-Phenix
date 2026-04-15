import { NextResponse } from "next/server";

/**
 * GET /api/langsmith/info
 * LangSmith SDK calls this on startup to check server capabilities.
 * Return minimal info to satisfy the SDK.
 */
export async function GET() {
  return NextResponse.json({
    version: "0.1.0",
    license_expiration_time: null,
    batch_ingest_config: {
      use_multipart_endpoint: false,
      size_limit_bytes: 20_971_520,
      size_limit: 20_971_520,
    },
  });
}
