/**
 * Transforms a filename to be CMS-friendly by:
 * 1. Converting dates with dots to hyphens (e.g., 7.29.2021 -> 7-29-2021)
 * 2. Handle version numbers with dots (e.g., v2.0 -> v2-0)
 * 3. Handle parentheses with text (e.g., v2.0-(2.19.21) -> v2-0-2-19-21)
 * 4. Convert apostrophes to hyphens (e.g., DICK'S -> DICK-S)
 * 5. Convert special characters to hyphens while preserving file extension
 */
export function transformFileName(originalFilename: string): string {
    // First, separate filename and extension
    const fileExtMatch = originalFilename.match(/\.[^.]+$/);
    const fileExt = fileExtMatch ? fileExtMatch[0] : '';
    let nameWithoutExt = fileExtMatch ? originalFilename.slice(0, -fileExt.length) : originalFilename;
    
    // Transform the filename part only
    nameWithoutExt = nameWithoutExt
        // Convert dates with dots to hyphens (matches number.number.number pattern)
        .replace(/(\d+)\.(\d+)\.(\d+)/g, '$1-$2-$3')
        // Handle version numbers with dots (e.g., v2.0 -> v2-0)
        .replace(/(\d+)\.(\d+)/g, '$1-$2')
        // Special case: Handle parentheses with text on both sides
        // When there's text/number before parentheses, replace with hyphen (e.g., v2.0-(2.19.21) -> v2-0-2-19-21)
        .replace(/([a-zA-Z0-9])\(([^)]+)\)/g, '$1-$2')
        // Replace all parentheses with hyphens to maintain word separation
        .replace(/[()]/g, '-')
        // Convert apostrophes to hyphens
        .replace(/'/g, '-')
        // Convert dollar signs to hyphens
        .replace(/\$/g, '-')
        // Clean up multiple consecutive hyphens
        .replace(/-+/g, '-')
        // Remove any trailing hyphens before we add back the extension
        .replace(/-+$/, '');
    
    // Reconstruct filename with extension
    return nameWithoutExt + fileExt;
} 