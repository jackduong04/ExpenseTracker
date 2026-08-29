interface RevisionMetadata {
  ledgerId: string;
  lastSeenRevision: number;
  contentHash: string;
}
const key = 'expense-tracker-revision-metadata';
export function getRevisionMetadata(): RevisionMetadata | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as RevisionMetadata | null;
  } catch {
    return null;
  }
}
export function setRevisionMetadata(value: RevisionMetadata) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Non-financial metadata is best effort. */
  }
}
