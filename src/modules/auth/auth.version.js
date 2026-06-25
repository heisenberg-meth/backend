import { CURRENT_AUTH_VERSION } from './auth.constants.js';

export const AUTH_VERSION = CURRENT_AUTH_VERSION;

export const AUTH_VERSION_LOG = {
  v1: {
    description: 'Initial auth version',
    createdAt: '2026-01-01',
    changes: ['Basic JWT auth with cookie-based sessions'],
  },
  v2: {
    description: 'Versioned auth with migration support',
    createdAt: '2026-06-25',
    changes: [
      'Added authVersion to JWT payloads',
      'Added authVersion to UserSession DB schema',
      'Version-aware session validation',
      'Enhanced cookie migration',
    ],
  },
};

export const compareVersions = (a, b) => {
  const parse = (v) => parseInt(v.replace('v', ''), 10);
  return parse(a) - parse(b);
};
