export function isTestEnvironment(): boolean {
  try {
    return process?.env?.NODE_ENV === "test";
  } catch (_e) {
    // process variable is not defined in PROD environment
    return false;
  }
}
