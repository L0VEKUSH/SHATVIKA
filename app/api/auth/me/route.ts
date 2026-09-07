import { NextResponse } from "next/server";
import { User } from "@/models/User";
import { connectToMongo } from "@/lib/mongoose";
import { getCustomerId, isCustomerAuthed } from "@/lib/customerAuth";

export async function GET() {
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

    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Transform to safe JSON (excludes password, passwordVersion, __v)
    const userData = {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || null,
      profilePhoto: user.profilePhoto || null,
      addresses: user.addresses || [],
      joinedDate: user.joinedDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return NextResponse.json({ ok: true, user: userData });
  } catch (err) {
    console.error("[CustomerMe] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
