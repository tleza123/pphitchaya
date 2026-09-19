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
 * The application is protected by Vercel Password Protection, so there is no
 * in-app sign-in prompt. Keep this boundary in one place for a future change.
 */
export async function verifyOwner(req: Request): Promise<AuthenticatedOwner> {
  void req;
  return {
    uid: 'vercel-protected-owner',
    email: process.env.OWNER_EMAIL || undefined
  };
}

