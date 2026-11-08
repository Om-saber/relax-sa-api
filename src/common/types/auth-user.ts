import type { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  permissions: string[];
  tokenVersion: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Passport already declares `Request.user?: Express.User`.
    // We enrich that interface instead of re-declaring the property.
    interface User extends AuthUser {}

    interface Request {
      requestId?: string;
    }
  }
}
