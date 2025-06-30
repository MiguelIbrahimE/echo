//logger.ts
export const log = (...args: unknown[]) =>
  process.env.NODE_ENV !== "test" && console.log("[be]", ...args);
