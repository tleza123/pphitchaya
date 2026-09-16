// Shim for server-only package when executing scripts outside Next.js bundler
if (typeof window !== 'undefined') {
  throw new Error('This module can only be loaded on the server.');
}

const empty = {};
export default empty;
