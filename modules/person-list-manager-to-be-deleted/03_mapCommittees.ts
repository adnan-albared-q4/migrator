import settings, { PersonData } from './_settings';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import * as readline from 'readline';
import { askQuestion, closeReadline } from '../../lib/helpers/ReadlineUtil';

dotenv.config();

interface Committee {
    name: string;
    workflowId: string;
    index: number;  // Add index to track position in the form
    selectors: {
        member: string;
        chair: string;
        viceChair: string;
        nonMember: string;
    };
    mappings: {
        memberTag?: string;
        chairTag?: string;
        viceChairTag?: string;
    };
}

interface CommitteeMembership {
    committeeName: string;
    role: 'Member' | 'Chair' | 'ViceChair' | 'Non-Member';
}

interface PersonFile {
    persons: (PersonData & { memberships?: CommitteeMembership[] })[];
}

interface TagMatch {
    tag: string;
    score: number;
}

interface ProposedMapping {
    committee: string;
    roles: {
        Member?: string;
        Chair?: string;
        ViceChair?: string;
    };
    scores: {
        Member?: number;
        Chair?: number;
        ViceChair?: number;
    };
}

interface CommitteeTagGroup {
    committee: string;
    tags: string[];
    matchScores: { [tag: string]: number };
}

function normalizeText(text: string): string {
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')  // Replace non-alphanumeric with spaces
        .replace(/\s+/g, ' ')         // Normalize spaces
        .trim();
}

function calculateMatchScore(tag: string, committeeName: string): number {
    // Simple string similarity score
    const tagWords = tag.toLowerCase().split(/\s+/);
    const committeeWords = committeeName.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const tagWord of tagWords) {
        if (committeeWords.some(word => word.includes(tagWord) || tagWord.includes(word))) {
            matches++;
        }
    }
    
    return matches / Math.max(tagWords.length, committeeWords.length);
}

function determineRoleInCommittee(tag: string): 'Member' | 'Chair' | 'ViceChair' | null {
    const normalizedTag = normalizeText(tag);
    
    // Check for Vice Chair first (most specific)
    if (normalizedTag.includes('vice')) {
        return 'ViceChair';
    }
    
    // Then check for Chair
    if (normalizedTag.includes('chair') || normalizedTag.includes('chairman')) {
        return 'Chair';
    }
    
    // Finally check for Member (now includes both member and board)
    if (normalizedTag.includes('member') || normalizedTag.includes('board')) {
        return 'Member';
    }
    
    // If the tag only contains the committee name (e.g., "alco"), assume it's a member
    return 'Member';
}

function groupTagsByCommittee(committees: string[], availableTags: string[]): CommitteeTagGroup[] {
    const groups: CommitteeTagGroup[] = committees.map(committee => ({
        committee,
        tags: [],
        matchScores: {}
    }));

    // First pass: Score and group tags by committee
    for (const tag of availableTags) {
        let bestScore = 0;
        let bestCommitteeIndex = -1;

        // Find best matching committee for this tag
        committees.forEach((committee, index) => {
            const normalizedTag = normalizeText(tag);
            const normalizedCommittee = normalizeText(committee);
            let score = 0;

            // Get committee prefix and check for exact matches first
            const committeePrefix = normalizedCommittee.split(' ')[0];
            
            // Exact committee-role pattern (e.g., "audit-member", "loan-chair")
            if (normalizedTag.startsWith(`${committeePrefix}-`)) {
                score += 100;  // Highest priority for exact committee prefix matches
                
                // Additional points for role indicators
                if (normalizedTag.includes('member') || normalizedTag.includes('board')) {
                    score += 30;
                }
                if (normalizedTag.includes('chair')) {
                    score += 30;
                }
                if (normalizedTag.includes('vice')) {
                    score += 40;
                }
            }
            // Partial committee name match
            else if (normalizedTag.includes(committeePrefix)) {
                score += 50;
            }

            // Committee alias matches
            const committeeMatches: { [key: string]: string[] } = {
                'alco': ['alco'],
                'audit': ['audit'],
                'compensation': ['comp', 'compensation'],
                'compliance': ['compliance'],
                'is': ['is', 'information systems'],
                'loan': ['loan'],
                'nominating': ['nominating', 'governance'],
                'profit sharing': ['profit', 'profit sharing']
            };

            // Check for committee name/alias matches
            for (const [committeeName, aliases] of Object.entries(committeeMatches)) {
                if (normalizedCommittee.includes(committeeName)) {
                    for (const alias of aliases) {
                        if (normalizedTag.includes(alias)) {
                            score += 40;
                            break;
                        }
                    }
                }
            }

            // Penalize if tag contains other committee names
            for (const [committeeName, aliases] of Object.entries(committeeMatches)) {
                if (!normalizedCommittee.includes(committeeName)) {
                    for (const alias of aliases) {
                        if (normalizedTag.includes(alias)) {
                            score -= 80;  // Strong penalty for matching other committees
                            break;
                        }
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestCommitteeIndex = index;
            }
        });

        // If we found a good committee match, add the tag to that group
        if (bestScore > 50 && bestCommitteeIndex !== -1) {  // Increased threshold to ensure better matches
            groups[bestCommitteeIndex].tags.push(tag);
            groups[bestCommitteeIndex].matchScores[tag] = bestScore;
        }
    }

    return groups;
}

async function findBestTagMatches(tag: string, committees: Committee[]): Promise<TagMatch[]> {
    const matches: TagMatch[] = [];
    
    for (const committee of committees) {
        const score = calculateMatchScore(tag.toLowerCase(), committee.name.toLowerCase());
        if (score > 0.5) {  // Threshold for considering it a match
            matches.push({ tag, score });
        }
    }
    
    return matches;
}

function autoMatchCommitteeTags(committees: string[], availableTags: string[]): ProposedMapping[] {
    // First, categorize tags by role
    const roleCategories = {
        ViceChair: [] as string[],
        Chair: [] as string[],
        Member: [] as string[]
    };

    console.log('\nStep 1: Categorizing tags by role...');
    availableTags.forEach(tag => {
        const normalizedTag = normalizeText(tag);
        
        // Check for Vice Chair first (most specific)
        if (normalizedTag.includes('vice')) {
            roleCategories.ViceChair.push(tag);
            console.log(`  Vice Chair tag found: ${tag}`);
        }
        // Then check for Chair
        else if (normalizedTag.includes('chair')) {
            roleCategories.Chair.push(tag);
            console.log(`  Chair tag found: ${tag}`);
        }
        // Finally check for Member (includes both 'member' and 'board')
        else if (normalizedTag.includes('member') || normalizedTag.includes('board')) {
            roleCategories.Member.push(tag);
            console.log(`  Member tag found: ${tag}`);
        }
    });

    console.log('\nRole Categories Summary:');
    Object.entries(roleCategories).forEach(([role, tags]) => {
        console.log(`${role}: ${tags.join(', ') || 'none'}`);
    });

    // Initialize mappings for each committee
    const mappings = committees.map(committee => ({
        committee,
        roles: {} as { [key: string]: string },
        scores: {} as { [key: string]: number }
    }));

    // Function to match tags to committees
    const matchTagsToCommittee = (tags: string[], role: 'Member' | 'Chair' | 'ViceChair') => {
        console.log(`\nMatching ${role} tags to committees...`);
        
        committees.forEach((committee, index) => {
            const committeePrefix = normalizeText(committee).split(' ')[0];
            let bestMatches: Array<{ tag: string; score: number }> = [];
            let bestScore = 0;

            tags.forEach(tag => {
                const normalizedTag = normalizeText(tag);
                let score = 0;

                // Exact match (e.g., "audit-member" for Audit Committee)
                if (normalizedTag.startsWith(`${committeePrefix}-`)) {
                    score = 100;
                    console.log(`  Exact match found: "${tag}" for "${committee}" (score: ${score})`);
                }
                // Partial match
                else if (normalizedTag.includes(committeePrefix)) {
                    score = 70;
                    console.log(`  Partial match found: "${tag}" for "${committee}" (score: ${score})`);
                }

                // Check for committee name/alias matches
                const committeeMatches: { [key: string]: string[] } = {
                    'alco': ['alco'],
                    'audit': ['audit'],
                    'compensation': ['comp', 'compensation'],
                    'compliance': ['compliance'],
                    'is': ['is', 'information systems'],
                    'loan': ['loan'],
                    'nominating': ['nominating', 'governance'],
                    'profit sharing': ['profit', 'profit sharing']
                };

                // Add points for committee alias matches
                for (const [committeeName, aliases] of Object.entries(committeeMatches)) {
                    if (normalizedTag.includes(committeeName)) {
                        score += 20;
                        console.log(`  Alias match bonus: "${tag}" matches "${committeeName}" (score: ${score})`);
                    }
                }

                // For Member role, treat -board and -member tags equally
                if (role === 'Member' && score > 0) {
                    if (normalizedTag.includes('board') || normalizedTag.includes('member')) {
                        score = Math.max(score, bestScore);
                    }
                }

                // If this score matches our best score, add it to candidates
                if (score >= bestScore) {
                    if (score > bestScore) {
                        bestMatches = [];
                        bestScore = score;
                    }
                    bestMatches.push({ tag, score });
                }
            });

            // If we found matches with a score above threshold
            if (bestScore >= 70 && bestMatches.length > 0) {
                // For Member role, prefer -member over -board if both exist with same score
                let selectedMatch = bestMatches[0];
                if (role === 'Member' && bestMatches.length > 1) {
                    const memberTag = bestMatches.find(m => normalizeText(m.tag).includes('member'));
                    if (memberTag) {
                        selectedMatch = memberTag;
                    }
                }

                mappings[index].roles[role] = selectedMatch.tag;
                mappings[index].scores[role] = selectedMatch.score;
                console.log(`  Selected match for ${committee} ${role}: ${selectedMatch.tag} (score: ${selectedMatch.score})`);
            }
        });
    };

    // Match tags in order of specificity
    matchTagsToCommittee(roleCategories.ViceChair, 'ViceChair');
    matchTagsToCommittee(roleCategories.Chair, 'Chair');
    matchTagsToCommittee(roleCategories.Member, 'Member');

    return mappings;
}

function displayProposedMappings(mappings: ProposedMapping[], availableTags: string[]): void {
    console.log('\nProposed Committee Mappings:\n');

    for (const mapping of mappings) {
        console.log(`${mapping.committee}:`);
        for (const role of ['Member', 'Chair', 'ViceChair'] as const) {
            const tag = mapping.roles[role];
            const score = mapping.scores[role];
            console.log(`- ${role}: ${tag ? `${tag} (score: ${score})` : '[none]'}`);
        }
        console.log('');
    }

    // Show unmatched tags
    const usedTags = new Set(Object.values(mappings.flatMap(m => Object.values(m.roles))));
    const unmatchedTags = availableTags.filter(tag => !usedTags.has(tag));
    
    if (unmatchedTags.length > 0) {
        console.log('Unmatched tags:');
        unmatchedTags.forEach(tag => console.log(`- ${tag}`));
        console.log('');
    }
}

async function getUniqueTags(persons: PersonData[]): Promise<string[]> {
    const allTags = new Set<string>();
    persons.forEach(person => {
        if (person.tags) {
            person.tags.forEach(tag => allTags.add(tag));
        }
    });
    return Array.from(allTags).sort();
}

async function scrapeCommittees(page: puppeteer.Page): Promise<Committee[]> {
    try {
        // Wait for committee panel to be visible
        await page.waitForSelector('#_ctrl0_ctl19_panelCommitteeMembershipDetails');

        // Get committee names
        const committees = await page.evaluate(() => {
            const committees: Committee[] = [];
            const labels = document.querySelectorAll('.committee_name-label');
            
            labels.forEach(label => {
                const name = label.textContent?.trim() || '';
                if (name) {
                    committees.push({
                        name,
                        workflowId: '',
                        index: 0,
                        selectors: {
                            member: '',
                            chair: '',
                            viceChair: '',
                            nonMember: ''
                        },
                        mappings: {}
                    });
                }
            });
            
            return committees;
        });

        return committees;
    } catch (error) {
        const err = error as Error;
        console.error('Error scraping committees:', err.message);
        return [];
    }
}

async function askTagMapping(committeeName: string, role: string, availableTags: string[]): Promise<string | undefined> {
    console.log('\nAvailable tags:');
    console.log('0: Skip (no tag for this role)');
    availableTags.forEach((tag, index) => {
        console.log(`${index + 1}: ${tag}`);
    });

    const response = await askQuestion(`Select tag number for ${committeeName} ${role} (or 0 to skip): `);
    const selection = parseInt(response);

    if (isNaN(selection) || selection < 0 || selection > availableTags.length) {
        console.log('Invalid selection. Skipping...');
        return undefined;
    }

    return selection === 0 ? undefined : availableTags[selection - 1];
}

async function mapCommitteeTags(committees: Committee[], availableTags: string[]): Promise<Committee[]> {
    // First, auto-match tags to committees
    const committeeNames = committees.map(c => c.name);
    const proposedMappings = autoMatchCommitteeTags(committeeNames, availableTags);
    
    // Display proposed mappings
    displayProposedMappings(proposedMappings, availableTags);
    
    // Ask user if they want to accept the proposed mappings
    const answer = await askQuestion('\nDo you want to accept these mappings? (y/n): ');
    
    if (answer.toLowerCase() === 'y') {
        // Apply the proposed mappings
        committees.forEach((committee, index) => {
            const mapping = proposedMappings[index];
            committee.mappings = {
                memberTag: mapping.roles.Member,
                chairTag: mapping.roles.Chair,
                viceChairTag: mapping.roles.ViceChair
            };
        });
        
        console.log('\nApplied auto-matched mappings.');
        return committees;
    }
    
    // If user doesn't accept auto-matches, fall back to manual selection
    console.log('\nProceeding with manual tag selection...');
    
    for (const committee of committees) {
        console.log(`\nMapping tags for ${committee.name}:`);
        
        committee.mappings.memberTag = await askTagMapping(committee.name, 'Member', availableTags);
        committee.mappings.chairTag = await askTagMapping(committee.name, 'Chair', availableTags);
        committee.mappings.viceChairTag = await askTagMapping(committee.name, 'Vice Chair', availableTags);
    }
    
    return committees;
}

function updatePersonMemberships(persons: PersonData[], committees: Committee[]): (PersonData & { memberships: CommitteeMembership[] })[] {
    return persons.map(person => {
        const memberships: CommitteeMembership[] = committees.map(committee => {
            const personTags = person.tags || [];
            
            if (committee.mappings.chairTag && personTags.includes(committee.mappings.chairTag)) {
                return { committeeName: committee.name, role: 'Chair' };
            }
            if (committee.mappings.viceChairTag && personTags.includes(committee.mappings.viceChairTag)) {
                return { committeeName: committee.name, role: 'ViceChair' };
            }
            if (committee.mappings.memberTag && personTags.includes(committee.mappings.memberTag)) {
                return { committeeName: committee.name, role: 'Member' };
            }
            
            return { committeeName: committee.name, role: 'Non-Member' };
        });

        return {
            ...person,
            memberships
        };
    });
}

export async function mapCommittees(subdomain: string): Promise<void> {
    if (!subdomain) {
        console.error('Usage: ts-node script.ts <subdomain>');
        return;
    }

    // Load persons data
    const personsPath = path.join(__dirname, 'persons.json');
    if (!fs.existsSync(personsPath)) {
        throw new Error('persons.json not found');
    }
    
    const personsData = JSON.parse(fs.readFileSync(personsPath, 'utf8')) as PersonFile;
    const uniqueTags = await getUniqueTags(personsData.persons);
    
    console.log('\nFound unique tags:', uniqueTags);

    // Launch browser and get committee information
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-dev-shm-usage'
        ]
    });
    
    const page = await browser.newPage();

    try {
        const sectionId = "08832295-eb3f-4dae-9c93-8435ba7ed7d2";
        const siteUrl = `https://${subdomain}.s4.q4web.com`;
        settings.baseUrlToCreateTo = new URL(`${siteUrl}/admin/login.aspx`);

        const cms = new CMSService({ url: settings.baseUrlToCreateTo, page });
        
        // Login
        console.log('Logging in...');
        await page.goto(settings.baseUrlToCreateTo.toString());
        await waitTillHTMLRendered(page);
        await cms.login();
        await waitTillHTMLRendered(page);

        // Navigate to person edit page to get committee information
        console.log('\nNavigating to person edit page...');
        const personListUrl = new URL(siteUrl);
        personListUrl.pathname = '/admin/default.aspx';
        personListUrl.search = `?LanguageId=1&SectionId=${sectionId}`;
        await page.goto(personListUrl.toString());
        await waitTillHTMLRendered(page);

        // Click create new to get to edit page
        await page.waitForSelector('#_ctrl0_ctl19_btnAddNew_submitButton');
        await page.click('#_ctrl0_ctl19_btnAddNew_submitButton');
        await waitTillHTMLRendered(page);

        // Get committee information
        console.log('Retrieving committee information...');
        const committees = await scrapeCommittees(page);
        console.log('\nFound committees:', committees.map(c => c.name));

        // Map tags to committee roles
        console.log('\nPlease map tags to committee roles...');
        const mappedCommittees = await mapCommitteeTags(committees, uniqueTags);

        // Save committee mappings
        const committeeMappingsPath = path.join(__dirname, 'committee-mappings.json');
        fs.writeFileSync(committeeMappingsPath, JSON.stringify({ committees: mappedCommittees }, null, 2));
        console.log('\nSaved committee mappings to committee-mappings.json');

        // Update persons with memberships
        const updatedPersons = updatePersonMemberships(personsData.persons, mappedCommittees);
        fs.writeFileSync(personsPath, JSON.stringify({ persons: updatedPersons }, null, 2));
        console.log('Updated persons.json with committee memberships');

    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        await browser.close();
        closeReadline();
    }
}

// Run directly if called from command line
if (require.main === module) {
    const subdomain = process.argv[2];
    mapCommittees(subdomain).catch(console.error);
} 