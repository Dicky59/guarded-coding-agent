const SECRET_BASENAME = /^\.env(\..+)?$/i;
const EXAMPLE_SUFFIX = /\.(example|sample|template|dist)$/i;
const SECRET_FILES = /^(id_rsa|id_ed25519|id_ecdsa|\.netrc|\.npmrc|\.pypirc)$/i;

/** True for files/dirs that commonly hold credentials (.env, ~/.ssh, ~/.aws, private keys...). */
export function isSecretPath(p: string): boolean {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  const base = parts.at(-1) ?? "";
  if (SECRET_BASENAME.test(base) && !EXAMPLE_SUFFIX.test(base)) return true;
  if (parts.some((seg) => seg === ".ssh" || seg === ".aws")) return true;
  return SECRET_FILES.test(base);
}

/** Heuristic: does a shell command mention a secret-looking path anywhere? */
export function referencesSecret(command: string): boolean {
  return command
    .split(/[\s"'`=<>|;&():]+/)
    .filter(Boolean)
    .some(isSecretPath);
}
