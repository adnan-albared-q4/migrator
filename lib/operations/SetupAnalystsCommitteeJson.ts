import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { StateManager } from '../core/StateManager';

interface SiteConfig {
  name: string;
  source: string;
}

function getSafeSiteDirName(siteName: string): string {
  return siteName.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export default class SetupAnalystsCommitteeJson {
  private sites: SiteConfig[];

  constructor(sites: SiteConfig[]) {
    this.sites = sites;
  }

  async execute() {
    // --- Centralized llmComplete tracking using StateManager ---
    const stateManager = StateManager.getInstance();
    for (const site of this.sites) {
      stateManager.updateSiteState(site.source, { llmComplete: false });
    }
    // --- End centralized llmComplete tracking ---

    const instructions = `Fill in the 'analysts', 'committees', and 'committeeMembers' arrays based on the provided HTML and the examples below. 
- For each analyst, if a website or profile URL exists, include it as the 'url' field.
- For each committee, extract any attachments (such as charters or PDFs) and add them as 'attachmentURL' in the committee object.
- For each committee member, list their committees and roles using the 'committee' and 'membershipRole' fields.
- Allowed membershipRole values for each committee: Committee Member, Committee Chair, Vice Chair, Non-Member
- Allowed specialRoles values: Lead Independent Director, Independent Director, Financial Expert, Board Chair, Director, Vice Board Chair, CEO
- Only fill in specialRoles based on what is present in the table legend for each person.
- There can be at most one Board Chair and one Vice Board Chair per committee.
- Ignore any linter errors or warnings; they are caused by the HTML and can be disregarded.
- Do not change any other part of the file.`;

    const analystsExample = [
      {
        "analyst": "John Doe",
        "firm": "Example Securities",
        "title": "Senior Research Analyst, CFA",
        "url": "https://example.com/analyst/john-doe",
        "email": "john.doe@example.com",
        "phone": "+1 123 456 7890",
        "location": "New York, NY\nUnited States",
        "targetPrice": "$50.00",
        "reportingDate": "2024-03-20",
        "rating": "Buy"
      }
    ];

    const committeesExample = [
      {
        "committee": "Audit Committee",
        "attachmentURL": "/files/doc_downloads/governance/Audit-Committee-Charter.pdf"
      },
      {
        "committee": "Compensation Committee",
        "attachmentURL": ""
      }
    ];

    const committeeMembersExample = [
      {
        "name": "John Doe",
        "committees": [
          { "committee": "Audit Committee", "membershipRole": "Committee Chair" },
          { "committee": "Compensation Committee", "membershipRole": "Committee Member" }
        ],
        "specialRoles": ["Lead Independent Director", "Financial Expert"]
      },
      {
        "name": "Jane Smith",
        "committees": [
          { "committee": "Audit Committee", "membershipRole": "Committee Member" }
        ],
        "specialRoles": []
      }
    ];

    for (const site of this.sites) {
      // Ensure destination is set to source for login
      const siteConfig = { ...site, destination: site.source };
      // Open browser and login headfully
      const loginManager = new LoginManager(siteConfig, false); // headless: false
      const loggedIn = await loginManager.login();
      if (loggedIn) {
        // After login, click the Public Site button if available
        const page = loginManager.getDashboardPage?.() || loginManager['page'];
        if (page) {
          try {
            await page.waitForSelector('#_ctrl0_lnkPublicSite', { visible: true, timeout: 10000 });
            await page.click('#_ctrl0_lnkPublicSite');
            console.log(chalk.green('Clicked the Public Site button automatically.'));
          } catch (err) {
            console.log(chalk.yellow('Public Site button not found or could not be clicked.'));
          }
        }
        console.log(chalk.green(`Dashboard for ${site.name} is open in your browser. Inspect as needed, then continue below.`));
      } else {
        console.log(chalk.red(`Failed to login to ${site.name}. Skipping prompts for this site.`));
        await loginManager.close();
        continue;
      }
      // Analysts
      const { hasAnalysts } = await inquirer.prompt([
        {
          type: 'list',
          name: 'hasAnalysts',
          message: `Does this site have an analysts list?`,
          choices: ['Yes', 'No'],
          default: 'No'
        }
      ]);
      stateManager.updateSiteState(site.source, { hasAnalystsList: hasAnalysts === 'Yes' });
      let analystsHtml = undefined;
      if (hasAnalysts === 'Yes') {
        const { html } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'html',
            message: `Paste the raw HTML for all analysts (multi-line, as copied from the site):`
          }
        ]);
        analystsHtml = html;
      }
      // Committee
      const { hasCommittee } = await inquirer.prompt([
        {
          type: 'list',
          name: 'hasCommittee',
          message: `Does this site have a committee composition?`,
          choices: ['Yes', 'No'],
          default: 'No'
        }
      ]);
      stateManager.updateSiteState(site.source, { hasCommitteeComposition: hasCommittee === 'Yes' });
      // If both answers are 'No', set llmComplete: true immediately
      if (hasAnalysts !== 'Yes' && hasCommittee !== 'Yes') {
        stateManager.updateSiteState(site.source, { llmComplete: true });
      }
      let committeeHtml = undefined;
      if (hasCommittee === 'Yes') {
        const { html } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'html',
            message: `Paste the raw HTML for the committee composition (multi-line, as copied from the site):`
          }
        ]);
        committeeHtml = html;
      }

      // Generate raw data JSON
      const rawDataOutput = {
        instructions,
        analystsExample,
        committeesExample,
        committeeMembersExample,
        siteName: site.name,
        html: {
          analystsHtml: analystsHtml || "",
          committeeHtml: committeeHtml || ""
        }
      };

      // Generate target JSON
      const targetOutput = {
        siteName: site.name,
        analysts: [],
        committees: [],
        committeeMembers: []
      };

      // Save both files
      const safeSiteName = getSafeSiteDirName(site.name);
      const outputDir = path.join(__dirname, '../../data', safeSiteName);
      fs.mkdirSync(outputDir, { recursive: true });
      
      // Save raw data
      const rawDataPath = path.join(outputDir, 'analyst-committee-raw.json');
      fs.writeFileSync(rawDataPath, JSON.stringify(rawDataOutput, null, 2), 'utf8');
      console.log(chalk.green(`\nRaw data JSON saved to: ${rawDataPath}`));

      // Save target file
      const targetPath = path.join(outputDir, 'analyst-committee-llm.json');
      fs.writeFileSync(targetPath, JSON.stringify(targetOutput, null, 2), 'utf8');
      console.log(chalk.green(`Target JSON saved to: ${targetPath}`));

      // Update state manager with both paths
      stateManager.updateSiteState(site.source, { 
        rawDataPath,
        llmJsonPath: targetPath
      });

      // Print instructional message
      console.log('\n==============================');
      console.log('PROCESSING INSTRUCTIONS:');
      console.log('1. Review the raw data and examples in:', rawDataPath);
      console.log('2. Fill in the arrays in:', targetPath);
      console.log('3. The target file will be used for migration');
      console.log('4. Make your changes directly in the JSON file');
      console.log('5. Do not provide feedback, explanations, or confirmation—just reply with "done" when finished');
      console.log('==============================\n');

      // Wait for user to finish
      await inquirer.prompt([
        {
          type: 'input',
          name: 'proceed',
          message: 'Press Enter when you have finished processing the files...'
        }
      ]);

      // Committee verification step
      try {
        const targetJson = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        const committees = targetJson.committees || [];
        const committeeNames = committees.map((c: any) => c.committee);
        let committeeMembers = targetJson.committeeMembers || [];
        // 1. Automated normalization of committee memberships and specialRoles
        function normalizeString(str: string) {
          return str.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        function fuzzyMatch(str: string, allowed: string[]): string | null {
          const normStr = normalizeString(str);
          let bestMatch = null;
          let bestScore = 0;
          for (const allowedVal of allowed) {
            const normAllowed = normalizeString(allowedVal);
            if (normStr === normAllowed) return allowedVal;
            // Partial match
            if (normAllowed.includes(normStr) || normStr.includes(normAllowed)) {
              if (normAllowed.length > bestScore) {
                bestMatch = allowedVal;
                bestScore = normAllowed.length;
              }
            }
            // Levenshtein distance (simple, not imported)
            const dist = (() => {
              const a = normStr, b = normAllowed;
              const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
              for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
              for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
              for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                  matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                  );
                }
              }
              return matrix[a.length][b.length];
            })();
            const similarity = 1 - dist / Math.max(normStr.length, normAllowed.length, 1);
            if (similarity > 0.7 && similarity > bestScore) {
              bestMatch = allowedVal;
              bestScore = similarity;
            }
          }
          return bestMatch;
        }
        // Normalize committee memberships
        const allowedMembershipRoles = [
          'Committee Member',
          'Committee Chair',
          'Vice Chair',
          'Non-Member',
        ];
        const allowedSpecialRoles = [
          'Lead Independent Director',
          'Independent Director',
          'Financial Expert',
          'Board Chair',
          'Director',
          'Vice Board Chair',
          'CEO',
        ];
        for (const member of committeeMembers) {
          if (!Array.isArray(member.committees)) continue;
          for (const mc of member.committees) {
            if (!allowedMembershipRoles.includes(mc.membershipRole)) {
              // If it's a specialRole, move it
              if (allowedSpecialRoles.includes(mc.membershipRole)) {
                member.specialRoles = member.specialRoles || [];
                if (!member.specialRoles.includes(mc.membershipRole)) {
                  member.specialRoles.push(mc.membershipRole);
                  console.log(chalk.yellow(`Moved '${mc.membershipRole}' from membership to specialRoles for ${member.name} in ${mc.committee}`));
                }
                mc.membershipRole = 'Committee Member';
                continue;
              }
              // Try fuzzy match
              const suggestion = fuzzyMatch(mc.membershipRole, allowedMembershipRoles);
              if (suggestion && suggestion !== mc.membershipRole) {
                const { accept } = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'accept',
                    message: `For ${member.name} in ${mc.committee}, change '${mc.membershipRole}' to '${suggestion}'?`,
                    default: true
                  }
                ]);
                if (accept) {
                  console.log(chalk.green(`Changed '${mc.membershipRole}' to '${suggestion}' for ${member.name} in ${mc.committee}`));
                  mc.membershipRole = suggestion;
                  continue;
                }
              }
              // Default to Committee Member
              console.log(chalk.yellow(`Unrecognized membershipRole '${mc.membershipRole}' for ${member.name} in ${mc.committee}. Defaulting to 'Committee Member'.`));
              mc.membershipRole = 'Committee Member';
            }
          }
          // Normalize specialRoles
          if (Array.isArray(member.specialRoles)) {
            for (let i = 0; i < member.specialRoles.length; i++) {
              const role = member.specialRoles[i];
              if (!allowedSpecialRoles.includes(role)) {
                const suggestion = fuzzyMatch(role, allowedSpecialRoles);
                if (suggestion && suggestion !== role) {
                  const { accept } = await inquirer.prompt([
                    {
                      type: 'confirm',
                      name: 'accept',
                      message: `For ${member.name}, change specialRole '${role}' to '${suggestion}'?`,
                      default: true
                    }
                  ]);
                  if (accept) {
                    console.log(chalk.green(`Changed specialRole '${role}' to '${suggestion}' for ${member.name}`));
                    member.specialRoles[i] = suggestion;
                    continue;
                  }
                }
                // If not accepted or no suggestion, log warning and remove
                console.log(chalk.yellow(`Unrecognized specialRole '${role}' for ${member.name}. Removing from specialRoles.`));
                member.specialRoles.splice(i, 1);
                i--;
              }
            }
          }
        }
        // 2. Confirm committees
        console.log('\nCommittees found in the JSON:');
        committeeNames.forEach((name: string, idx: number) => {
          console.log(`  ${idx + 1}. ${name}`);
        });
        const { committeesOk } = await inquirer.prompt([
          {
            type: 'list',
            name: 'committeesOk',
            message: 'Are these committees correct?',
            choices: ['Yes', 'No'],
            default: 'Yes'
          }
        ]);
        if (committeesOk !== 'Yes') {
          console.log(chalk.yellow('Please review and correct the committees in the JSON file before proceeding.'));
        }

        // 2. Interactive review/edit of committee members
        let done = false;
        while (!done) {
          // Print a static summary of all people, memberships, and special roles
          console.log('\nCommittee Members Overview:\n');
          committeeMembers.forEach((m: any) => {
            const memberships = (m.committees || []).map((mc: any) => `    - ${mc.committee} (${mc.membershipRole})`).join('\n');
            const specialRoles = (m.specialRoles || []).length > 0
              ? (m.specialRoles || []).map((sr: string) => `    - ${sr}`).join('\n')
              : '    None';
            console.log(`${m.name}\n  Memberships:\n${memberships || '    None'}\n  Special Roles:\n${specialRoles}\n`);
          });
          // Inquirer prompt: just names, plus actions
          const memberChoices = committeeMembers.map((m: any, idx: number) => ({ name: m.name, value: idx }));
          memberChoices.push({ name: 'All correct, continue (reload from file)', value: 'reload' });
          memberChoices.push({ name: 'Finish and save', value: 'done' });
          const { selectedMember } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedMember',
              message: 'Select a person to edit, or choose an action:',
              choices: memberChoices,
              default: memberChoices.length - 1
            }
          ]);
          if (selectedMember === 'done') {
            done = true;
            break;
          }
          if (selectedMember === 'reload') {
            // Reload JSON from disk and update committeeMembers and committeeNames
            try {
              const reloadedJson = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
              committeeMembers = reloadedJson.committeeMembers || [];
              // Optionally reload committeeNames if committees could change
              // committeeNames = (reloadedJson.committees || []).map((c: any) => c.committee);
            } catch (e) {
              console.log(chalk.red('Could not reload JSON from disk.'));
            }
            continue;
          }
          // Edit submenu
          let back = false;
          while (!back) {
            const { editAction } = await inquirer.prompt([
              {
                type: 'list',
                name: 'editAction',
                message: `Edit ${committeeMembers[selectedMember].name}:`,
                choices: [
                  { name: 'Edit committee memberships', value: 'editMemberships' },
                  { name: 'Edit special roles', value: 'editSpecialRoles' },
                  { name: 'Go back', value: 'back' }
                ],
                default: 2
              }
            ]);
            if (editAction === 'back') {
              back = true;
              continue;
            }
            if (editAction === 'editSpecialRoles') {
              // Edit special roles
              let specialRoles = committeeMembers[selectedMember].specialRoles || [];
              let specialDone = false;
              while (!specialDone) {
                const removeChoices = specialRoles.map((role: string) => ({ name: `Remove ${role}`, value: `remove:${role}` }));
                const addChoices = allowedSpecialRoles.filter(r => !specialRoles.includes(r)).map((role: string) => ({ name: `Add ${role}`, value: `add:${role}` }));
                const confirmChoice = { name: 'Confirm and go back', value: 'confirm' };
                const specialChoices = [...removeChoices, ...addChoices, confirmChoice];
                const { specialAction } = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'specialAction',
                    message: `Edit special roles for ${committeeMembers[selectedMember].name}:`,
                    choices: specialChoices,
                    default: specialChoices.length - 1
                  }
                ]);
                if (specialAction === 'confirm') {
                  specialDone = true;
                  committeeMembers[selectedMember].specialRoles = specialRoles;
                  continue;
                }
                if (specialAction.startsWith('remove:')) {
                  const roleToRemove = specialAction.replace('remove:', '');
                  specialRoles = specialRoles.filter((r: string) => r !== roleToRemove);
                } else if (specialAction.startsWith('add:')) {
                  const roleToAdd = specialAction.replace('add:', '');
                  specialRoles.push(roleToAdd);
                }
              }
            } else if (editAction === 'editMemberships') {
              // Edit committee memberships (improved flow)
              let memberships = committeeMembers[selectedMember].committees || [];
              let editMembershipsDone = false;
              while (!editMembershipsDone) {
                // Build committee list with current status
                const committeeChoices = committeeNames.map((committee: string) => {
                  const current = memberships.find((m: any) => m.committee === committee);
                  const status = current ? current.membershipRole : 'Not a member';
                  return {
                    name: `${committee} (${status})`,
                    value: committee
                  };
                });
                committeeChoices.push({ name: 'Go back', value: 'back' });
                const { committeeToEdit } = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'committeeToEdit',
                    message: `Select a committee to edit for ${committeeMembers[selectedMember].name}:`,
                    choices: committeeChoices,
                    default: committeeChoices.length - 1
                  }
                ]);
                if (committeeToEdit === 'back') {
                  editMembershipsDone = true;
                  continue;
                }
                // Edit the selected committee's role
                const current = memberships.find((m: any) => m.committee === committeeToEdit);
                const { newRole } = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'newRole',
                    message: `${committeeMembers[selectedMember].name} in ${committeeToEdit}:`,
                    choices: [
                      ...allowedMembershipRoles.filter(r => r !== 'Non-Member'),
                      'Not a member'
                    ],
                    default: current ? current.membershipRole : 'Not a member'
                  }
                ]);
                if (newRole === 'Not a member') {
                  memberships = memberships.filter((m: any) => m.committee !== committeeToEdit);
                } else {
                  const idx = memberships.findIndex((m: any) => m.committee === committeeToEdit);
                  if (idx !== -1) {
                    memberships[idx].membershipRole = newRole;
                  } else {
                    memberships.push({ committee: committeeToEdit, membershipRole: newRole });
                  }
                }
                committeeMembers[selectedMember].committees = memberships;
              }
            }
          }
        }
        // Save the updated committeeMembers array back to the JSON and write to disk
        targetJson.committeeMembers = committeeMembers;
        fs.writeFileSync(targetPath, JSON.stringify(targetJson, null, 2), 'utf8');
        // Set llmComplete to true after user has finished all edits
        stateManager.updateSiteState(site.source, { llmComplete: true });
      } catch (e) {
        console.log(chalk.red('Could not read or parse target JSON for committee verification.'));
      }

      // Close browser before moving to next site
      await loginManager.close();
    }
  }
} 