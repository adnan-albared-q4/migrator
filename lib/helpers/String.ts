/*
  Checks whether or not a string is absolute or relative
*/
export function isAbsoluteUrl(str: string){
  try {
    const url = new URL(str);
    return true;    
  } catch {
    return false;
  }
}

/*
  Converts a String to a CMS page friendly string:
  e.g.
  This is a-- title
  This-is-a-title
*/
export function convertStringToCMSPageUrl(str: string){
  // First remove extra whitespace,
  // Then remove most special characters that the CMS will remove
  // Then replace spaces with dash
  // Then replace multiple spaces with a single dash
  return str.trim()
            .replace(/[!"`'#%&,:;<>=@{}~]/g, '')
            // \$\(\)\*\+\/\\\?\[\]\^\|]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            // took out \ after first / - SOFIA
}

/*
  Takes a string and converts it into a tag string
  e.g.
  This Is A Category293 => this_is_a_category293
*/
export function convertStringToTagForm(str: string): string {
  return str.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
}

/*
  Take the body, and list of files, and changes the path to the local path.
  This is used in places like Press Releases where clients have assets
  on the page that need to be transferred over and rebound to the file location
  within the CMS.
  
  Files must be an array containing items structured as followed:
  [
    {
      href: 'https://www.example.com/image.png'
      localPath: 'files/doc_news/2022/12/2/image.png'
    }
  ]
*/
interface FileEntry {
  href?: string;
  localPath?: string;
  images?: Array<FileEntry>;
  body?: string;
}

export function convertImagePathsInBodyToLocalPaths(entry: FileEntry) {
  if (entry.body && entry.images) {
    entry.body = changePath(entry.body, entry.images);
  }
}

function changePath(text: string, files: Array<FileEntry>) {
  for (const file of files) {
    if (file.href && file.localPath) {
      const re = new RegExp(file.href, 'g');
      text = text.replace(re, file.localPath);
    }
  }
  return text;
}

export function urlHasFileExtension(url: URL) {
  try {
    const pathParts = url.pathname.split('/');
    const lastPart = pathParts.pop();
    if (!lastPart) {
      return false;
    }
    const match = lastPart.match(/\.[A-z]+$/);
    return match !== null;
  } catch (_) {
    return true;
  }
}

export function createFilenameWithURLAndExtension(url: URL, extension: string) {
  if (urlHasFileExtension(url)) {
    const pathParts = url.pathname.split('/');
    const filename = pathParts.pop();
    if (!filename) {
      throw new Error('Invalid URL: no filename found');
    }
    const match = filename.match(/\.[A-z]+$/);
    if (!match) {
      throw new Error('Invalid URL: no file extension found');
    }
    const ext = match[0];
    const nameWithoutExt = filename.slice(0, -ext.length).replace(/\./g, '-');
    return `${nameWithoutExt}${ext}${extension}`;
  } else if (extension.length === 0 || extension === '.') {
    console.log('error stage:', url, extension);
    throw new Error('Invalid extension provided to url with no extension');
  }
  if (!extension.startsWith('.')) {
    extension = `.${extension}`;
    console.log('editing stage:', extension);
  }
  const pathParts = url.pathname.split('/');
  const filename = pathParts.pop();
  if (!filename) {
    throw new Error('Invalid URL: no filename found');
  }
  return `${filename.replace(/\./g, '-')}${extension}`;
}


/*
  Converts a string to title case
*/
export function titleize(str: string) {
  let upper = true
  let newStr = ""
  for (let i = 0, l = str.length; i < l; i++) {
      // Note that you can also check for all kinds of spaces  with
      // str[i].match(/\s/)
      if (str[i] == " ") {
          upper = true
          newStr += str[i]
          continue
      }
      newStr += upper ? str[i].toUpperCase() : str[i].toLowerCase()
      upper = false
  }
  return complete(newStr);
}

// Certain minor words should be left lowercase unless 
// they are the first or last words in the string

const lowers = ['A', 'An', 'The', 'And', 'But', 'Or', 'For', 'Nor', 'As', 'At', 
'By', 'For', 'From', 'In', 'Into', 'Near', 'Of', 'On', 'Onto', 'To', 'With'];

// Certain words such as initialisms or acronyms should be left uppercase
const uppers = ['Agsm', 'Mpn', 'Id', 'Tv', 'Pwc', 'Ceo', 'Cfo', 'Cto', 'Llp', 'Nyse', 'Nasdaq','Usa', 'Tsx', 'Tsxv', 'Et', 'Mm', 'Md&a'];

function complete(str : string) {
  str = str.replace(/([^\W_]+[^\s-]*) */g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });

  for (const word of lowers) {
    str = str.replace(new RegExp('\\s' + word + '\\s', 'g'), (txt) => txt.toLowerCase());
  }    

  for (const word of uppers){
    str = str.replace(new RegExp('\\b' + word + '\\b', 'g'), word.toUpperCase());
  }

  return str;
}

/**
 * Calculates the Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + substitutionCost // substitution
            );
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculates string similarity as a percentage
 */
export function stringSimilarity(a: string, b: string): number {
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    return 1 - distance / maxLength;
}

/**
 * Enhanced name normalization that handles suffixes, middle initials, and commas
 */
export function normalizeName(fullName: string): { firstName: string; lastName: string; original: string } {
    // Convert to lowercase and remove extra spaces
    let normalized = fullName.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Remove common suffixes
    const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'esq', 'esquire', 'phd', 'md'];
    suffixes.forEach(suffix => {
        normalized = normalized.replace(new RegExp(`\\b${suffix}\\b[.,]?`, 'i'), '');
    });

    // Remove periods and commas
    normalized = normalized.replace(/[.,]/g, '');

    // Split into parts
    const parts = normalized.split(' ').filter(part => part.length > 0);
    
    // If we have more than 2 parts, it likely has middle names/initials
    if (parts.length > 2) {
        // Take first and last parts, ignoring middle
        return {
            firstName: parts[0],
            lastName: parts[parts.length - 1],
            original: fullName
        };
    }
    
    // If we have exactly 2 parts, it's a simple first/last name
    if (parts.length === 2) {
        return {
            firstName: parts[0],
            lastName: parts[1],
            original: fullName
        };
    }
    
    // Fallback for single names
    return {
        firstName: parts[0],
        lastName: parts[0],
        original: fullName
    };
}