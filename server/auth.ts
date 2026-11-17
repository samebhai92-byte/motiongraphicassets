import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface FirebaseAppletConfig {
  projectId: string;
}

function loadProjectId(): string {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as FirebaseAppletConfig;
  if (!parsed.projectId) {
    throw new Error('Missing projectId in firebase-applet-config.json');
  }
  return parsed.projectId;
}

const FIREBASE_PROJECT_ID = loadProjectId();
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'sameeransari89368165@gmail.com')
  .trim()
  .toLowerCase();

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface AuthenticatedRequest extends Request {
  authUser?: VerifiedFirebaseUser;
}

export async function verifyBearerToken(req: Request): Promise<VerifiedFirebaseUser | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }

    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch {
    return null;
  }
}

export function isAdminUser(user: VerifiedFirebaseUser | null): boolean {
  if (!user || !user.email || !user.emailVerified) {
    return false;
  }
  return user.email.trim().toLowerCase() === ADMIN_EMAIL;
}

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await verifyBearerToken(req);
  if (!user) {
    res.status(401).json({
      error: 'Authentication required. Please sign in with the administrator Google account.',
    });
    return;
  }

  if (!isAdminUser(user)) {
    res.status(403).json({
      error: 'Access denied. Only the configured administrator account may perform this operation.',
      email: user.email,
    });
    return;
  }

  req.authUser = user;
  next();
}
