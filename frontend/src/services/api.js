// Barrel: re-exports the shared axios client + all domain API modules.
// Split from the former 1345-line monolith (see ./api/*).
export * from './api/account';
export * from './api/mobility';
export * from './api/commerce';
export * from './api/market';
export * from './api/tracking';
export * from './api/events';
export * from './api/travel';
export * from './api/health';
export * from './api/content';
export * from './api/admin';
export { api } from './api/client';
export { default } from './api/client';
