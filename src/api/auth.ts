// ponytail: Hono auth router (email/pass, sessions, Google OAuth)
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { hashPassword, verifyPassword, createSession, getSessionUser, revokeSession } from '../services/auth';
import { checkRateLimit } from '../services/rate-limit';

export const authRouter = new Hono<{ Bindings: Env; Variables: { user?: User | null } }>();

// Register
authRouter.post('/register', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `reg:${ip}`, 5, 300);
  if (!rl.success) {
    return c.json({ error: 'Too many registration attempts. Please try again later.' }, 429);
  }

  const { email, password } = await c.req.json();
  if (!email || !password || password.length < 6) {
    return c.json({ error: 'Valid email and password (min 6 chars) required' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) {
    return c.json({ error: 'Email already registered' }, 400);
  }

  const userId = `usr_${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(password);
  
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).bind(userId, email.toLowerCase(), passwordHash, 'user').run();

  const sessionId = await createSession(c.env.DB, userId);
  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  });

  return c.json({ success: true, user: { id: userId, email: email.toLowerCase(), role: 'user' } });
});

// Login
authRouter.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `login:${ip}`, 10, 60);
  if (!rl.success) {
    return c.json({ error: 'Too many login attempts.' }, 429);
  }

  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first<User>();

  if (!user || !user.password_hash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const sessionId = await createSession(c.env.DB, user.id);
  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  });

  return c.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
});

// Logout
authRouter.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (sessionId) {
    await revokeSession(c.env.DB, sessionId);
  }
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ success: true });
});

// Me
authRouter.get('/me', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) {
    return c.json({ user: null });
  }
  const user = await getSessionUser(c.env.DB, sessionId);
  return c.json({ user });
});

// Google OAuth Redirect
authRouter.get('/google', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'Google OAuth not configured' }, 400);
  }
  const redirectUri = `${c.env.APP_URL || 'http://localhost:5173'}/api/auth/google/callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile`;
  return c.redirect(url);
});

// Google OAuth Callback
authRouter.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('OAuth Code missing', 400);

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${c.env.APP_URL || 'http://localhost:5173'}/api/auth/google/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) {
      return c.text('Failed to retrieve OAuth token', 400);
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo: any = await userRes.json();

    let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?')
      .bind(userInfo.id, userInfo.email.toLowerCase())
      .first<User>();

    if (!user) {
      const userId = `usr_${crypto.randomUUID()}`;
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, google_id, role) VALUES (?, ?, ?, ?)'
      ).bind(userId, userInfo.email.toLowerCase(), userInfo.id, 'user').run();

      user = { id: userId, email: userInfo.email.toLowerCase(), role: 'user', created_at: new Date().toISOString() };
    } else if (!user.google_id) {
      await c.env.DB.prepare('UPDATE users SET google_id = ? WHERE id = ?').bind(userInfo.id, user.id).run();
    }

    const sessionId = await createSession(c.env.DB, user.id);
    setCookie(c, 'session', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60
    });

    return c.redirect('/?login=success');
  } catch (err: any) {
    return c.text(`Google auth failed: ${err.message}`, 500);
  }
});
