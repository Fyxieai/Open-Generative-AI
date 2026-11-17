import {
  mkdir,
  readFile,
  writeFile,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  randomUUID,
} from "node:crypto";
import path from "node:path";

export class Store {
  constructor(directory) {
    this.directory = directory;
    this.state = {
      version: 1,
      providers: {},
      jobs: [],
      idempotency: Object.create(null),
      quota: {},
    };
    this.pending = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const keyPath = path.join(this.directory, "secret.key");
    try {
      this.key = await readFile(keyPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.key = randomBytes(32);
      await writeFile(keyPath, this.key, { mode: 0o600, flag: "wx" });
    }
    if (this.key.length !== 32)
      throw new Error("Studio secret key must contain 32 bytes");
    await chmod(keyPath, 0o600);
    try {
      this.state = JSON.parse(
        await readFile(path.join(this.directory, "state.json"), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error("Studio data cannot be read; refusing to replace it");
    }
    if (
      this.state.version !== 1 ||
      !Array.isArray(this.state.jobs) ||
      !this.state.providers ||
      !this.state.idempotency ||
      !this.state.quota
    )
      throw new Error("Unsupported studio data format");
    this.state.idempotency = Object.assign(
      Object.create(null),
      this.state.idempotency,
    );
    for (const job of this.state.jobs)
      if (["queued", "running"].includes(job.status)) {
        job.status = "failed";
        job.error =
          "Interrupted by server restart. Submit a new job to try again.";
        job.updatedAt = new Date().toISOString();
      }
    await this.save();
  }
  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
  }
  keyFor(provider) {
    const saved = this.state.providers[provider]?.encryptedKey;
    if (!saved) return "";
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(saved.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(saved.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(saved.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
  save() {
    const snapshot = JSON.stringify(this.state);
    const work = this.pending.then(async () => {
      const temporary = path.join(this.directory, `.state-${randomUUID()}.tmp`);
      await writeFile(temporary, snapshot, { mode: 0o600, flag: "wx" });
      await rename(temporary, path.join(this.directory, "state.json"));
    });
    this.pending = work.catch(() => {});
    return work;
  }
  async saveMedia(id, bytes) {
    const file = this.mediaPath(id),
      temporary = file + ".tmp";
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  }
  mediaPath(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid job identifier");
    return path.join(this.directory, `${id}.media`);
  }
  async removeMedia(id) {
    await unlink(this.mediaPath(id)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
