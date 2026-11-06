// Deterministic statement normalization for duplicate detection. No ML, no embeddings.

export function normalizeStatement(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
