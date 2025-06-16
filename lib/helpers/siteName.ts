export function getSafeSiteDirName(siteName: string): string {
  return siteName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
} 