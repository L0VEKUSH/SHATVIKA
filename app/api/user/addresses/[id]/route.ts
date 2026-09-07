import { NextResponse } from 'next/server';
import { User } from '@/models/User';
import { connectToMongo } from '@/lib/mongoose';
import { getCustomerId, isCustomerAuthed } from '@/lib/customerAuth';
import { validatePhone } from '@/lib/validators';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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

    const address = user.addresses?.find((addr: any) => String(addr._id) === id);
    if (!address) {
      return NextResponse.json(
        { ok: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, address });
  } catch (err) {
    console.error('[GetAddress] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch address' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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

    await connectToMongo();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const address = user.addresses?.find((addr: any) => String(addr._id) === id);
    if (!address) {
      return NextResponse.json(
        { ok: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    // Update fields if provided
    if (label !== undefined) {
      if (typeof label !== 'string' || !label.trim()) {
        return NextResponse.json(
          { ok: false, error: 'Label must be a non-empty string' },
          { status: 400 }
        );
      }
      address.label = label.trim();
    }

    if (street !== undefined) {
      if (typeof street !== 'string' || !street.trim()) {
        return NextResponse.json(
          { ok: false, error: 'Street must be a non-empty string' },
          { status: 400 }
        );
      }
      address.street = street.trim();
    }

    if (city !== undefined) {
      if (typeof city !== 'string' || !city.trim()) {
        return NextResponse.json(
          { ok: false, error: 'City must be a non-empty string' },
          { status: 400 }
        );
      }
      address.city = city.trim();
    }

    if (state !== undefined) {
      if (typeof state !== 'string' || !state.trim()) {
        return NextResponse.json(
          { ok: false, error: 'State must be a non-empty string' },
          { status: 400 }
        );
      }
      address.state = state.trim();
    }

    if (zipCode !== undefined) {
      if (typeof zipCode !== 'string' || !zipCode.trim()) {
        return NextResponse.json(
          { ok: false, error: 'Zip code must be a non-empty string' },
          { status: 400 }
        );
      }
      address.zipCode = zipCode.trim();
    }

    if (phone !== undefined) {
      const phoneVal = validatePhone(phone);
      if (!phoneVal.valid) {
        return NextResponse.json(
          { ok: false, error: phoneVal.error },
          { status: 400 }
        );
      }
      address.phone = phone.replace(/\D/g, '');
    }

    if (isDefault !== undefined) {
      // If setting to default, unset others
      if (isDefault && user.addresses) {
        user.addresses.forEach((addr: any) => {
          if (String(addr._id) !== id) {
            addr.isDefault = false;
          }
        });
      }
      address.isDefault = isDefault === true;
    }

    await user.save();

    return NextResponse.json({ ok: true, address });
  } catch (err) {
    console.error('[UpdateAddress] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to update address' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.addresses || user.addresses.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    const addressIndex = user.addresses.findIndex((addr: any) => String(addr._id) === id);
    if (addressIndex === -1) {
      return NextResponse.json(
        { ok: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    // Don't allow deleting if it's the only address
    if (user.addresses.length === 1) {
      return NextResponse.json(
        { ok: false, error: 'Cannot delete the only address' },
        { status: 400 }
      );
    }

    const wasDefault = user.addresses[addressIndex].isDefault;
    user.addresses.splice(addressIndex, 1);

    // If deleted address was default, set the first one as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DeleteAddress] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to delete address' },
      { status: 500 }
    );
  }
}
