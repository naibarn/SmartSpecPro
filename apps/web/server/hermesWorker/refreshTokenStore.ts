import { open, readFile, rename, rm } from "node:fs/promises";

function assertRefreshToken(refreshToken: string): void {
  if (!refreshToken || /[\r\n]/.test(refreshToken)) {
    throw new Error("Hermes worker refresh token is invalid");
  }
}

export async function readHermesRefreshToken(
  tokenFile: string,
  bootstrapToken: string,
): Promise<string> {
  try {
    const persisted = (await readFile(tokenFile, "utf8")).trim();
    assertRefreshToken(persisted);
    return persisted;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    assertRefreshToken(bootstrapToken);
    return bootstrapToken;
  }
}

export async function persistHermesRefreshToken(
  tokenFile: string,
  refreshToken: string,
): Promise<void> {
  assertRefreshToken(refreshToken);
  const temporaryFile = `${tokenFile}.${process.pid}.tmp`;
  const handle = await open(temporaryFile, "w", 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(`${refreshToken}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryFile, tokenFile);
  } catch (error) {
    await rm(temporaryFile, { force: true }).catch(() => {});
    throw error;
  }
}
