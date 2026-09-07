import { NextResponse } from "next/server";
import { clearCustomerSession } from "@/lib/customerAuth";

export async function POST() {
  try {
    await clearCustomerSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CustomerLogout] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to logout" },
      { status: 500 }
    );
  }
}
