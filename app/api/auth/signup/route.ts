import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { User } from "@/models/User";
import { connectToMongo } from "@/lib/mongoose";
import { setCustomerSession } from "@/lib/customerAuth";
import { validateEmail, validatePassword, validatePhone, validateFullName } from "@/lib/validators";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    // Rate limit: 5 signup attempts per minute per IP
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = await rateLimit(`signup:${ip}`, 5, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { email, password, confirmPassword, fullName, phone } = body;

    // Validation
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { ok: false, error: emailValidation.error },
        { status: 400 }
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { ok: false, error: "Password does not meet requirements", details: passwordValidation.errors },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Passwords do not match" },
        { status: 400 }
      );
    }

    const fullNameValidation = validateFullName(fullName);
    if (!fullNameValidation.valid) {
      return NextResponse.json(
        { ok: false, error: fullNameValidation.error },
        { status: 400 }
      );
    }

    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return NextResponse.json(
        { ok: false, error: phoneValidation.error },
        { status: 400 }
      );
    }

    await connectToMongo();

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (existingUser) {
      return NextResponse.json(
        { ok: false, error: "Email is already registered" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      email: email.toLowerCase().trim(),
      password: passwordHash,
      passwordVersion: 0,
      fullName: fullName.trim(),
      phone: phone.replace(/\D/g, ""),
      joinedDate: new Date(),
      preference: { currency: "INR", language: "EN" },
    });

    await user.save();

    // Set session
    await setCustomerSession(String(user._id), user, false);

    return NextResponse.json(
      { ok: true, userId: String(user._id) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[CustomerSignup] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}
