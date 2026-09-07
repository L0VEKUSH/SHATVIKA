import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { User } from "@/models/User";
import { connectToMongo } from "@/lib/mongoose";
import { setCustomerSession } from "@/lib/customerAuth";
import { validateEmail } from "@/lib/validators";
import { rateLimit } from "@/lib/rateLimit";

const FAKE_HASH = "$2b$10$fakehashfakehashfakehashfakehashfakehashfakehashfakehash";

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 login attempts per minute per IP
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = await rateLimit(`login:${ip}`, 5, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const emailRaw = body?.email;
    const passwordRaw = body?.password;
    const rememberMe = body?.rememberMe === true;

    const email = normalizeEmail(emailRaw);
    const password = String(passwordRaw ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { ok: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    await connectToMongo();

    // Query using normalized email
    const user = await User.findOne({ email }).lean();

    // For timing-safe comparison: use fake hash if user not found
    const passwordHash = user?.password ?? FAKE_HASH;

    // Always perform comparison, even if user doesn't exist
    // This prevents timing attacks that leak whether the email exists
    const passwordOk = await bcrypt.compare(password, passwordHash);

    if (!user || !passwordOk) {
      return NextResponse.json(
        { ok: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // JWT cookie based on user id and full user data
    await setCustomerSession(String(user._id), user, rememberMe);

    return NextResponse.json({ ok: true, userId: String(user._id) });
  } catch (err) {
    console.error("[CustomerLogin] error:", err);
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
