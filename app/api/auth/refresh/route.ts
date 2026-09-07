import { NextResponse } from "next/server";
import { User } from "@/models/User";
import { connectToMongo } from "@/lib/mongoose";
import { getCustomerId, setCustomerSession, isCustomerAuthed } from "@/lib/customerAuth";

export async function POST() {
  try {
    // Check if customer is authenticated
    const isAuthed = await isCustomerAuthed();
    if (!isAuthed) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = await getCustomerId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    await connectToMongo();

    // Get updated user data
    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Refresh token with sliding window (8 hours)
    await setCustomerSession(userId, user, false);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CustomerRefresh] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to refresh session" },
      { status: 500 }
    );
  }
}
