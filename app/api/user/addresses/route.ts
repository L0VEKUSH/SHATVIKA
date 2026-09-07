import { NextResponse } from 'next/server';
import { User } from '@/models/User';
import { connectToMongo } from '@/lib/mongoose';
import { getCustomerId, isCustomerAuthed } from '@/lib/customerAuth';
import { validatePhone } from '@/lib/validators';

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

    return NextResponse.json({ ok: true, addresses: user.addresses || [] });
  } catch (err) {
    console.error('[GetAddresses] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch addresses' },
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

    const { label, street, city, state, zipCode, phone, isDefault } = body;

    // Validate required fields
    if (!label || typeof label !== 'string' || !label.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Label is required' },
        { status: 400 }
      );
    }

    if (!street || typeof street !== 'string' || !street.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Street address is required' },
        { status: 400 }
      );
    }

    if (!city || typeof city !== 'string' || !city.trim()) {
      return NextResponse.json(
        { ok: false, error: 'City is required' },
        { status: 400 }
      );
    }

    if (!state || typeof state !== 'string' || !state.trim()) {
      return NextResponse.json(
        { ok: false, error: 'State is required' },
        { status: 400 }
      );
    }

    if (!zipCode || typeof zipCode !== 'string' || !zipCode.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Zip code is required' },
        { status: 400 }
      );
    }

    const phoneVal = validatePhone(phone);
    if (!phoneVal.valid) {
      return NextResponse.json(
        { ok: false, error: phoneVal.error },
        { status: 400 }
      );
    }

    const newAddress = {
      label: label.trim(),
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      phone: phone.replace(/\D/g, ''),
      isDefault: isDefault === true,
    };

    await connectToMongo();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // If isDefault, unset other defaults
    if (newAddress.isDefault && user.addresses) {
      user.addresses.forEach((addr: any) => {
        addr.isDefault = false;
      });
    }


    if (!user.addresses) {
      user.addresses = [];
    }

    user.addresses.push(newAddress);
    await user.save();

    return NextResponse.json({ ok: true, addresses: user.addresses });
  } catch (err) {
    console.error('[CreateAddress] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to create address' },
      { status: 500 }
    );
  }
}
