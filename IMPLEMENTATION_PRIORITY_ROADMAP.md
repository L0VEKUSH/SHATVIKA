# IMPLEMENTATION PRIORITY ROADMAP
## Step-by-Step Guide to Production Readiness

---

## 🚨 STOP: Before You Continue

**DO NOT DEPLOY** until you complete **PHASE A (Critical Fixes)**.

These are blocking issues that could cause:
- ❌ Data loss (Seed endpoint)
- ❌ Financial loss (No payments)
- ❌ Security breach (No XSS/CSRF protection)
- ❌ Denial of Service (No rate limiting)

---

## 📅 PHASE A: CRITICAL FIXES (Weeks 1-1.5)

### ✅ MUST FIX #1: Secure Seed Endpoint (30 min)
**File:** `app/api/seed/route.ts`
**Current Risk:** CRITICAL - Database reset on any request

```typescript
// BEFORE:
export async function GET(req: NextRequest) {
  await seed();
  return Response.json({ seeded: true });
}

// AFTER:
export async function GET(req: NextRequest) {
  // Check environment
  if (process.env.NODE_ENV === 'production') {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Check secret key
  const seedKey = req.headers.get('x-seed-key');
  if (seedKey !== process.env.SEED_KEY) {
    console.warn('Unauthorized seed attempt from:', req.headers.get('x-forwarded-for'));
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    await seed();
    return Response.json({ seeded: true, timestamp: new Date() });
  } catch (error) {
    console.error('Seed error:', error);
    return Response.json({ error: 'Seed failed' }, { status: 500 });
  }
}
```

**Verification:**
```bash
# Should return 403 in production
curl https://yourdomain.com/api/seed

# Should return 401 without key
curl https://yourdomain.com/api/seed -H "x-seed-key: wrong"

# Should work with correct key in dev
curl http://localhost:3000/api/seed -H "x-seed-key: dev-secret"
```

---

### ✅ MUST FIX #2: Add Rate Limiting to All Endpoints (4-6 hours)
**Files:** All API routes in `app/api/*`
**Current Risk:** HIGH - DDoS vulnerability

**Step 1: Update Rate Limiter**

**File:** `lib/rateLimit.ts`
```typescript
// BEFORE:
const store = new Map();

export function checkRateLimit(key: string) {
  // ... basic logic
}

// AFTER:
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 h'),
});

export async function checkRateLimit(identifier: string, limit: number = 100, window: number = 3600) {
  const { success, remaining } = await ratelimit.limit(identifier);
  return { success, remaining };
}
```

**Step 2: Apply to Public Endpoints**

**Example - `/api/menu/route.ts`:**
```typescript
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  // Get client IP
  const ip = req.headers.get('x-forwarded-for') || 
             req.headers.get('x-real-ip') || 
             'unknown';
  
  // Check rate limit: 100 requests per hour
  const { success, remaining } = await checkRateLimit(`menu:${ip}`, 100, 3600);
  
  if (!success) {
    return new Response('Rate limited', { 
      status: 429,
      headers: {
        'Retry-After': '3600',
        'X-RateLimit-Remaining': remaining.toString()
      }
    });
  }
  
  const menu = await MenuItem.find().lean();
  return Response.json(menu);
}
```

**Apply to these endpoints:**
- `/api/menu` (GET)
- `/api/menu/[id]` (GET)
- `/api/reviews` (GET)
- `/api/gallery` (GET)
- `/api/coupons/validate` (POST)
- `/api/auth/login` (POST) - Already has limits
- `/api/auth/signup` (POST) - Already has limits
- All other public endpoints

**Verification:**
```bash
# Test rate limiting
for i in {1..101}; do
  curl https://yourdomain.com/api/menu
  echo "Request $i"
done
# 101st request should return 429
```

---

### ✅ MUST FIX #3: Implement XSS Protection (2-3 hours)
**Files:** Input points (reviews, comments, gallery titles)
**Current Risk:** HIGH - JavaScript injection

**Step 1: Install DOMPurify**
```bash
npm install isomorphic-dompurify
```

**Step 2: Apply to User Input**

**Example - Review Component:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

export function ReviewCard({ review }: { review: Review }) {
  // Sanitize user input
  const cleanComment = DOMPurify.sanitize(review.comment);
  
  return (
    <div className="review">
      <p>{review.name}</p>
      {/* Use dangerouslySetInnerHTML only for sanitized content */}
      <p dangerouslySetInnerHTML={{ __html: cleanComment }} />
    </div>
  );
}
```

**Step 3: Add Server-Side Sanitization**

**File:** `app/api/reviews/route.ts`
```typescript
import DOMPurify from 'isomorphic-dompurify';

export async function POST(req: NextRequest) {
  const { comment, name, rating } = await req.json();
  
  // Sanitize before saving
  const cleanComment = DOMPurify.sanitize(comment);
  const cleanName = DOMPurify.sanitize(name);
  
  const review = new Review({
    comment: cleanComment,
    name: cleanName,
    rating,
    // ...
  });
  
  await review.save();
  return Response.json(review);
}
```

**Apply to:**
- `app/api/reviews/route.ts` (POST)
- `app/api/content/route.ts` (POST for gallery titles)
- Review component render
- Gallery title render

**Verification:**
```bash
# Test XSS protection
curl -X POST https://yourdomain.com/api/reviews \
  -H "Content-Type: application/json" \
  -d '{"comment":"<script>alert(1)</script>","name":"Test"}'

# Should return sanitized: &lt;script&gt;alert(1)&lt;/script&gt;
```

---

### ✅ MUST FIX #4: Add CSRF Protection (3-4 hours)
**Files:** All POST/PUT/DELETE routes
**Current Risk:** HIGH - State-changing requests can be forged

**Step 1: Install CSRF Library**
```bash
npm install @edge-runtime/cookies
```

**Step 2: Add CSRF Middleware**

**File:** `middleware.ts` (Update existing)
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
const CSRF_METHODS_EXEMPT = ['/api/auth/login', '/api/auth/signup'];

export function middleware(request: NextRequest) {
  const method = request.method;
  const pathname = request.nextUrl.pathname;
  
  // Check CSRF for protected methods
  if (PROTECTED_METHODS.includes(method) && !CSRF_METHODS_EXEMPT.includes(pathname)) {
    const token = request.headers.get('x-csrf-token');
    const sessionToken = request.cookies.get('csrf-token')?.value;
    
    if (!token || token !== sessionToken) {
      return new NextResponse('CSRF token invalid', { status: 403 });
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*']
};
```

**Step 3: Generate CSRF Token**

**File:** `app/api/csrf/route.ts` (New file)
```typescript
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const token = randomBytes(32).toString('hex');
  
  const cookieStore = cookies();
  cookieStore.set('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600
  });
  
  return Response.json({ csrfToken: token });
}
```

**Step 4: Update Client Components**

**Example - Review Form:**
```typescript
export function ReviewForm() {
  const [csrfToken, setCsrfToken] = useState('');
  
  useEffect(() => {
    // Fetch CSRF token
    fetch('/api/csrf')
      .then(r => r.json())
      .then(data => setCsrfToken(data.csrfToken));
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken // Include CSRF token
      },
      body: JSON.stringify(formData)
    });
    
    if (response.status === 403) {
      alert('Security error. Please refresh and try again.');
      return;
    }
    
    // ...
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

---

### ✅ MUST FIX #5: Secure File Upload (3-4 hours)
**File:** `app/api/upload/route.ts`
**Current Risk:** CRITICAL - Arbitrary file upload

```typescript
// BEFORE (vulnerable):
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File;
  
  // Directly save file - DANGEROUS!
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(`./public/${file.name}`, buffer);
  
  return Response.json({ url: `/public/${file.name}` });
}

// AFTER (secure):
import { createWriteStream } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = join(process.cwd(), '.uploads'); // Outside public/

export async function POST(req: NextRequest) {
  try {
    // Authenticate
    const token = req.headers.get('authorization');
    if (!token) return new Response('Unauthorized', { status: 401 });
    
    const form = await req.formData();
    const file = form.get('file') as File;
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ 
        error: 'Invalid file type. Allowed: JPEG, PNG, WebP' 
      }, { status: 400 });
    }
    
    // Validate file size
    if (file.size > MAX_SIZE) {
      return Response.json({ 
        error: 'File too large. Max 5MB' 
      }, { status: 413 });
    }
    
    // Sanitize filename
    const sanitized = file.name
      .replace(/[^a-zA-Z0-9.]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(-100); // Limit length
    
    // Add random prefix to prevent collisions
    const filename = `${randomBytes(8).toString('hex')}_${sanitized}`;
    const filepath = join(UPLOAD_DIR, filename);
    
    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filepath, buffer);
    
    // Return secure URL (not directly accessible)
    return Response.json({ 
      url: `/api/uploads/${filename}`,
      filename: filename,
      size: buffer.length
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

**Add Download Endpoint:**
```typescript
// app/api/uploads/[filename]/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const filepath = join(process.cwd(), '.uploads', params.filename);
  
  // Verify file exists and is in upload dir
  if (!existsSync(filepath) || !filepath.startsWith(uploadDir)) {
    return new Response('Not found', { status: 404 });
  }
  
  const buffer = readFileSync(filepath);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
}
```

---

### ✅ MUST FIX #6: Payment Integration (5-7 days)
**This is the largest task in Phase A**

**Option A: Stripe (Recommended)**
```bash
npm install stripe @stripe/react-js
```

**Step 1: Setup Stripe Account**
1. Go to stripe.com
2. Create account
3. Get API keys from dashboard
4. Add to `.env.local`:
```
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Step 2: Create Checkout Session**

**File:** `app/api/checkout/route.ts` (New)
```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { items, customerId } = await req.json();
  
  try {
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: items.map(item => ({
        price_data: {
          currency: 'inr',
          product_data: {
            name: item.name,
            images: [item.image]
          },
          unit_amount: Math.round(item.price * 100) // Convert to paise
        },
        quantity: item.quantity
      })),
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`
    });
    
    return Response.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return Response.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
```

**Step 3: Handle Webhook**

**File:** `app/api/webhooks/stripe/route.ts` (New)
```typescript
import Stripe from 'stripe';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = headers().get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return Response.json({ error: 'Webhook error' }, { status: 400 });
  }
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Update order status
      await Order.updateOne(
        { sessionId: session.id },
        { status: 'Confirmed', paymentStatus: 'Paid' }
      );
      
      break;
    }
    case 'charge.failed': {
      const charge = event.data.object as Stripe.Charge;
      
      // Update order status
      await Order.updateOne(
        { sessionId: charge.payment_intent },
        { paymentStatus: 'Failed' }
      );
      
      break;
    }
  }
  
  return Response.json({ success: true });
}
```

**Step 4: Update Cart Component**

```typescript
export function Cart() {
  const handleCheckout = async () => {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cartItems,
        customerId: userId
      })
    });
    
    const { sessionId, url } = await response.json();
    
    // Redirect to Stripe
    window.location.href = url;
  };
  
  return (
    <button onClick={handleCheckout}>
      Proceed to Payment
    </button>
  );
}
```

---

## ✅ VERIFICATION CHECKLIST - PHASE A

After completing all 6 fixes, verify:

- [ ] Seed endpoint returns 403 on production
- [ ] Rate limiting returns 429 after 100 requests/hour
- [ ] XSS payload `<script>alert(1)</script>` is escaped
- [ ] CSRF token is required for POST/PUT/DELETE
- [ ] File upload rejects non-image files
- [ ] File upload rejects files > 5MB
- [ ] Stripe payment gateway works end-to-end
- [ ] Webhook successfully updates order status
- [ ] No errors in console
- [ ] Database is not reset by seed endpoint

---

## 📅 PHASE B: HIGH PRIORITY (Week 1.5-2)

After Phase A is complete, do Phase B in parallel:

1. **Fix Data Integrity** (1-2 hours)
   - User.addresses validation
   - One default address per user

2. **Fix Unguarded Context Reads** (2-3 hours)
   - Gallery, Reviews, Cart, MenuSection
   - Add isLoading checks

3. **Add Error Handling** (2-3 hours)
   - Dynamic routes error.tsx
   - API response error handling

4. **Password Change JWT Invalidation** (1-2 hours)
   - Increment passwordVersion
   - Verify on token refresh

5. **Database Optimization** (2-3 hours)
   - Add indexes
   - N+1 query fixes

---

## 🚀 DEPLOYMENT AFTER PHASES A & B

Once both phases complete (roughly 2 weeks):

1. Run full test suite
2. Performance test (load testing)
3. Security audit (pen test)
4. Final code review
5. Deploy to production

---

## 📞 SUPPORT

If you encounter issues during implementation:

1. Check line numbers in original files
2. Verify environment variables are set
3. Test with curl before deploying
4. Check server logs for detailed errors

---

**Estimated time to follow this roadmap: 2 weeks**
**Recommended team size: 2 developers**
**Deadline for Phase A: End of Week 1**
