const baseUrl = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

const results = [];

function check(name, passed, details) {
  results.push({ name, passed, details });
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, status: response.status };
  }
}

function cookieHeader(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')];
  return values
    .filter(Boolean)
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function invalidLogin(path) {
  const csrfResponse = await fetch(`${baseUrl}/api/csrf`);
  const csrfBody = await readJson(csrfResponse);
  if (!csrfResponse.ok || typeof csrfBody.csrfToken !== 'string') {
    throw new Error(`CSRF bootstrap failed with HTTP ${csrfResponse.status}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader(csrfResponse),
      origin: baseUrl,
      'x-csrf-token': csrfBody.csrfToken,
    },
    body: JSON.stringify({
      email: 'verification.invalid@example.com',
      password: 'not-a-real-password',
    }),
  });

  return { response, body: await readJson(response) };
}

try {
  const publicResponse = await fetch(baseUrl);
  const publicHtml = await publicResponse.text();
  const csp = publicResponse.headers.get('content-security-policy') || '';

  check('Public page', publicResponse.status === 200, `HTTP ${publicResponse.status}`);
  check(
    'Counter-only notice',
    publicHtml.includes('Counter collection only') || publicHtml.includes('Delivery currently unavailable'),
    'Rendered HTML identifies counter collection',
  );
  check(
    'Production CSP',
    csp.length > 0 && !csp.includes("'unsafe-eval'"),
    !csp ? 'header missing' : csp.includes("'unsafe-eval'") ? 'contains unsafe-eval' : 'present without unsafe-eval',
  );
  const hasNosniff = publicResponse.headers.get('x-content-type-options') === 'nosniff';
  const hasPermissionsPolicy = Boolean(publicResponse.headers.get('permissions-policy'));
  check(
    'Security headers',
    hasNosniff && hasPermissionsPolicy,
    `nosniff=${hasNosniff}, permissionsPolicy=${hasPermissionsPolicy}`,
  );

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const healthBody = await readJson(healthResponse);
  check('Readiness health', healthResponse.status === 200 && healthBody.ok === true, `HTTP ${healthResponse.status}`);

  const customerLogin = await invalidLogin('/api/auth/login');
  check(
    'Customer invalid login',
    customerLogin.response.status === 401 && customerLogin.body.error === 'INVALID_CREDENTIALS',
    `HTTP ${customerLogin.response.status}`,
  );

  const adminLogin = await invalidLogin('/admin/api/login');
  check(
    'Admin invalid login',
    adminLogin.response.status === 401 && adminLogin.body.error === 'INVALID_CREDENTIALS',
    `HTTP ${adminLogin.response.status}`,
  );
} catch (error) {
  check('Smoke runner', false, error instanceof Error ? error.message : 'Unknown error');
}

for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${result.details}`);
}

if (results.some((result) => !result.passed)) {
  process.exitCode = 1;
}
