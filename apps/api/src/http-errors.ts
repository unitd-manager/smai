export function isClientDisconnectError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = error.code;
  return code === "ECANCELED" || code === "ECONNABORTED" || code === "ECONNRESET" || code === "EPIPE";
}
