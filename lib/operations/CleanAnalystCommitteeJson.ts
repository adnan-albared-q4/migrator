import * as fs from 'fs';
import * as path from 'path';

/**
 * Clean up analyst-committee-llm.json for selected sites:
 * - Remove the 'html' property from each site object
 * - Remove 'instructions', 'analystsExample', 'committeesExample', 'committeeMembersExample', and 'llmComplete' from the root
 * Overwrites the original file and prints a summary.
 * Usage: Called from misc operations menu, passing an array of site directory names.
 */
export async function cleanAnalystCommitteeJson(selectedSites: string[]) {
  if (!selectedSites || selectedSites.length === 0) {
    console.log('[CleanAnalystCommitteeJson] No sites selected. Exiting.');
    return;
  }

  for (const siteDir of selectedSites) {
    const jsonPath = path.join('data', siteDir, 'analyst-committee-llm.json');
    if (!fs.existsSync(jsonPath)) {
      console.warn(`[CleanAnalystCommitteeJson] File not found: ${jsonPath}`);
      continue;
    }
    let raw;
    try {
      raw = fs.readFileSync(jsonPath, 'utf8');
    } catch (e) {
      console.error(`[CleanAnalystCommitteeJson] Failed to read file: ${jsonPath}`);
      continue;
    }
    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      // Fallback: remove html fields as text if JSON.parse fails
      console.warn(`[CleanAnalystCommitteeJson] JSON.parse failed for ${jsonPath}, attempting regex-based cleanup...`);
      // Remove 'html': { ... }, (with or without trailing comma, across multiple lines)
      let cleaned = raw.replace(/"html"\s*:\s*\{[\s\S]*?\}\s*,?/g, '');
      // Also handle 'html': { ... } if it's the last property (no trailing comma)
      cleaned = cleaned.replace(/,?\s*"html"\s*:\s*\{[^}]*\}/gs, '');
      try {
        json = JSON.parse(cleaned);
        // Remove root-level fields
        delete json.instructions;
        delete json.analystsExample;
        delete json.committeesExample;
        delete json.committeeMembersExample;
        delete json.llmComplete;
        fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
        console.log(`[CleanAnalystCommitteeJson] Cleaned (regex fallback) and saved: ${jsonPath}`);
        continue;
      } catch (e2) {
        console.error(`[CleanAnalystCommitteeJson] Could not clean or parse file: ${jsonPath}`);
        continue;
      }
    }
    // Remove root-level fields
    delete json.instructions;
    delete json.analystsExample;
    delete json.committeesExample;
    delete json.committeeMembersExample;
    delete json.llmComplete;
    if (!Array.isArray(json.sites)) {
      console.warn(`[CleanAnalystCommitteeJson] No 'sites' array in file: ${jsonPath}`);
      continue;
    }
    let cleanedCount = 0;
    for (const siteObj of json.sites) {
      if (siteObj.html) {
        delete siteObj.html;
        cleanedCount++;
      }
    }
    try {
      fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
      console.log(`[CleanAnalystCommitteeJson] Cleaned ${cleanedCount} site(s) in ${jsonPath}`);
    } catch (e) {
      console.error(`[CleanAnalystCommitteeJson] Failed to write cleaned file: ${jsonPath}`);
    }
  }
  console.log('[CleanAnalystCommitteeJson] Operation complete.');
}

// Integration for misc operations menu
if (require.main === module) {
  // Example: node CleanAnalystCommitteeJson.js ENB_Financial AnotherSite
  const args = process.argv.slice(2);
  cleanAnalystCommitteeJson(args);
} 