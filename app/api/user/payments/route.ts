import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { User } from '@/models/User';
import { connectToMongo } from '@/lib/mongoose';
import { getCustomerId, isCustomerAuthed } from '@/lib/customerAuth';

export async function GET() {
  try {
    const isAuthed = await isCustomerAuthed();
    if (!isAuthed) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = await getCustomerId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectToMongo();

    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Return only safe payment method info (last 4 digits, type, id)
    const paymentMethods = (user.savedPaymentMethods || []).map((method: any) => ({
      id: method.id,
      type: method.type,
      lastFour: method.lastFour,
    }));

    return NextResponse.json({ ok: true, paymentMethods });

  } catch (err) {
    console.error('[GetPayments] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch payment methods' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const isAuthed = await isCustomerAuthed();
    if (!isAuthed) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = await getCustomerId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { type, lastFour } = body;

    // Validate payment method type
    if (!type || !['card', 'upi', 'wallet'].includes(type)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payment type' },
        { status: 400 }
      );
    }

    if (!lastFour || typeof lastFour !== 'string' || lastFour.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payment identifier' },
        { status: 400 }
      );
    }

    await connectToMongo();

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          savedPaymentMethods: {
            id: crypto.randomUUID(),
            type,
            lastFour: String(lastFour).slice(-4),
          },
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[CreatePayment] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to add payment method' },
      { status: 500 }
    );
  }
}
