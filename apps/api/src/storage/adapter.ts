// Object storage for note audio (Cloudflare R2, TECH-ARCHITECTURE.md section
// 1: "S3-compatible API so any client library works unchanged"). Behind an
// adapter for the same reason transcription is: real R2 in staging and
// production, an in-memory fake in tests, so nothing here or in
// notes/service.ts depends on network access to pass.
export interface StorageAdapter {
  upload(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
