import 'server-only';

export interface AuthenticatedOwner {
  uid: string;
  email?: string;
}

export class AuthError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message?: string) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Single-owner mode has no in-app sign-in. This function supplies a stable
 * actor ID for audit records; deployment access must be protected separately.
 */
export async function verifyOwner(req: Request): Promise<AuthenticatedOwner> {
  void req;
  return {
    uid: 'vercel-protected-owner',
    email: process.env.OWNER_EMAIL || undefined
  };
}

