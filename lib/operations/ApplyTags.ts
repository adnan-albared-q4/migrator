import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

// Types from SetupTaggingRules
interface TagRule {
    action: 'add' | 'remove';
    tag: string;
    conditions: {
        type: 'tag' | 'title_set';
        operator: 'and' | 'or';
        value: string;
        negate?: boolean;
    }[];
}

interface TitleSet {
    name: string;
    titles: string[];
}

interface TaggingConfig {
    rules: TagRule[];
    titleSets: TitleSet[];
    metadata: {
        created: string;
        lastModified: string;
        description?: string;
    };
}

interface TitleSetVerification {
    setName: string;
    expectedCount: number;
    foundCount: number;
    missingTitles: string[];
    foundTitles: string[];
}

interface TagState {
    currentTags: string[];
    addedTags: string[];
    removedTags: string[];
    verificationStatus: 'success' | 'failure';
    error?: string;
}

export class ApplyTags extends Base {
    private readonly configPath: string;
    private config: TaggingConfig;
    private titleSetVerifications: TitleSetVerification[] = [];
    private tagStates: Map<string, TagState> = new Map();
    private readonly SECTION_ID = 'de305d4f-2c81-4acf-975a-b859e43248c8';

    constructor(site: SiteConfig) {
        super(site);
        this.configPath = join(process.cwd(), 'data', this.site.name, 'tagging-config.json');
        this.config = this.loadConfig();
    }

    async execute(): Promise<boolean> {
        try {
            console.log('\n' + chalk.blue('Applying tags for ' + this.site.name));

            // Phase 1: Basic Setup and Title Set Verification
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to get logged in page');
            }

            // Navigate to PR list and get all entries
            console.log(chalk.blue('\nNavigating to press release list...'));
            const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
            const url = `${baseUrl}/admin/default.aspx?LanguageId=1&SectionId=${this.SECTION_ID}`;
            await page.goto(url, { waitUntil: 'networkidle0' });
            
            // Get all PR entries
            const entries = await this.getAllPREntries(page);
            console.log(chalk.green(`Found ${entries.length} press releases`));

            // Verify title sets
            await this.verifyTitleSets(entries);

            // Debug pause after title set verification
            const { continueAfterVerification } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'continueAfterVerification',
                    message: '\nReview the title set verification above. Continue with tag application?',
                    default: false
                }
            ]);

            if (!continueAfterVerification) {
                console.log(chalk.yellow('Operation cancelled by user.'));
                return false;
            }

            // Phase 2: Apply Tags
            console.log(chalk.blue('\nApplying tags...'));
            for (const entry of entries) {
                await this.processEntry(page, entry);
            }

            // Phase 3: Generate Report
            this.generateReport();

            return true;
        } catch (error) {
            console.error(chalk.red('Error in ApplyTags:'), error);
            return false;
        }
    }

    private loadConfig(): TaggingConfig {
        try {
            if (existsSync(this.configPath)) {
                return JSON.parse(readFileSync(this.configPath, 'utf8'));
            }
            throw new Error('No tagging configuration found');
        } catch (error) {
            console.error(chalk.red('Error loading configuration:'), error);
            throw error;
        }
    }

    private async getAllPREntries(page: any): Promise<{ title: string; editLink: string }[]> {
        const entries: { title: string; editLink: string }[] = [];
        let hasNextPage = true;
        let processedPages = new Set<number>();

        while (hasNextPage) {
            // Get current page number
            const currentPageSpan = await page.$('td[colspan="6"] span');
            if (!currentPageSpan) {
                hasNextPage = false;
                continue;
            }

            const currentPageText = await page.evaluate((el: Element) => el.textContent?.trim() || '', currentPageSpan);
            const currentPageNum = parseInt(currentPageText);
            
            // Process current page if not already processed
            if (!processedPages.has(currentPageNum)) {
                console.log(`Processing page ${currentPageNum}...`);
                
                // Get entries from current page
                const pageEntries = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)'));
                    return rows.map(row => {
                        // Get title from the 3rd column (index 2)
                        const titleCell = row.querySelector('td:nth-child(3)');
                        const editLink = row.querySelector('a.grid-list-action-edit')?.getAttribute('href');
                        return {
                            title: titleCell?.textContent?.trim() || '',
                            editLink: editLink || ''
                        };
                    }).filter(entry => entry.title && entry.title !== 'Headline' && entry.editLink); // Filter out header and invalid entries
                });

                entries.push(...pageEntries);
                processedPages.add(currentPageNum);

                // Debug output for first page
                if (currentPageNum === 1) {
                    console.log(chalk.yellow('\nFirst 6 titles found:'));
                    pageEntries.slice(0, 6).forEach((entry: { title: string; editLink: string }, index: number) => {
                        console.log(chalk.yellow(`${index + 1}. "${entry.title}"`));
                    });
                }
            }

            // Get all pagination links
            const paginationLinks = await page.$$('td[colspan="6"] a');
            
            // Get all visible page numbers
            const visiblePages = new Set<number>();
            for (const link of paginationLinks) {
                const linkText = await page.evaluate((el: Element) => el.textContent?.trim() || '', link);
                if (linkText !== '...') {
                    const pageNum = parseInt(linkText);
                    if (!isNaN(pageNum)) {
                        visiblePages.add(pageNum);
                    }
                }
            }

            // Check if we've processed all visible pages
            const allVisiblePagesProcessed = Array.from(visiblePages).every(pageNum => 
                processedPages.has(pageNum)
            );

            // Find next page to process
            let nextPageLink = null;
            
            if (allVisiblePagesProcessed) {
                // If all visible pages are processed, look for "..." link
                const lastLink = paginationLinks[paginationLinks.length - 1];
                const lastLinkText = await page.evaluate((el: Element) => el.textContent?.trim() || '', lastLink);
                
                if (lastLinkText === '...') {
                    nextPageLink = lastLink;
                } else {
                    hasNextPage = false;
                }
            } else {
                // Find the next unprocessed page
                for (const link of paginationLinks) {
                    const linkText = await page.evaluate((el: Element) => el.textContent?.trim() || '', link);
                    if (linkText !== '...') {
                        const pageNum = parseInt(linkText);
                        if (!processedPages.has(pageNum)) {
                            nextPageLink = link;
                            break;
                        }
                    }
                }
            }

            if (!nextPageLink) {
                hasNextPage = false;
                continue;
            }

            // Click next page
            await nextPageLink.click();
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
        }

        return entries;
    }

    private normalizeTitle(title: string): string {
        return title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
            .replace(/[^\w\s-]/g, ''); // Remove special characters except spaces and hyphens
    }

    private async verifyTitleSets(entries: { title: string; editLink: string }[]): Promise<void> {
        console.log(chalk.blue('\nVerifying title sets...'));
        
        for (const set of this.config.titleSets) {
            const verification: TitleSetVerification = {
                setName: set.name,
                expectedCount: set.titles.length,
                foundCount: 0,
                missingTitles: [],
                foundTitles: []
            };

            // Check each title in the set
            for (const title of set.titles) {
                const normalizedSetTitle = this.normalizeTitle(title);
                const found = entries.some(entry => this.normalizeTitle(entry.title) === normalizedSetTitle);
                if (found) {
                    verification.foundCount++;
                    verification.foundTitles.push(title);
                } else {
                    verification.missingTitles.push(title);
                }
            }

            // Log results
            console.log(chalk.blue(`\nSet: ${set.name}`));
            console.log(chalk.green(`Found ${verification.foundCount} out of ${set.titles.length} titles`));
            
            if (verification.missingTitles.length > 0) {
                console.log(chalk.yellow(`Missing ${verification.missingTitles.length} titles`));
                // Log a few examples of missing titles for debugging
                const examples = verification.missingTitles.slice(0, 3);
                console.log(chalk.yellow('Example missing titles:'));
                examples.forEach(title => {
                    console.log(chalk.yellow(`- "${title}"`));
                });
            }

            this.titleSetVerifications.push(verification);
        }
    }

    private async processEntry(page: any, entry: { title: string; editLink: string }): Promise<void> {
        console.log(chalk.blue(`\nProcessing: ${entry.title}`));
        
        // Navigate to edit page - editLink is already a complete URL
        console.log(`Navigating to edit page: ${entry.editLink}`);
        await page.goto(entry.editLink, { waitUntil: 'networkidle0' });

        // Get current tags
        const currentTags = await this.getCurrentTags(page);
        const tagState: TagState = {
            currentTags,
            addedTags: [],
            removedTags: [],
            verificationStatus: 'success'
        };

        // Process each rule
        for (const rule of this.config.rules) {
            if (await this.evaluateRule(entry.title, currentTags, rule)) {
                if (rule.action === 'add') {
                    if (currentTags.includes(rule.tag)) {
                        console.log(chalk.yellow(`Tag "${rule.tag}" already exists, skipping`));
                    } else {
                        tagState.addedTags.push(rule.tag);
                    }
                } else if (rule.action === 'remove' && currentTags.includes(rule.tag)) {
                    tagState.removedTags.push(rule.tag);
                }
            }
        }

        // Apply changes if needed
        if (tagState.addedTags.length > 0 || tagState.removedTags.length > 0) {
            console.log(chalk.yellow('\nChanges to be made:'));
            if (tagState.addedTags.length > 0) {
                console.log(chalk.green(`Adding tags: ${tagState.addedTags.join(', ')}`));
            }
            if (tagState.removedTags.length > 0) {
                console.log(chalk.red(`Removing tags: ${tagState.removedTags.join(', ')}`));
            }

            await this.applyTagChanges(page, tagState);
        }

        this.tagStates.set(entry.title, tagState);
    }

    private async getCurrentTags(page: any): Promise<string[]> {
        return await page.evaluate(() => {
            const tagInput = document.querySelector('input[name*="TagSelection"][name*="txtTags"]');
            return tagInput ? (tagInput as HTMLInputElement).value.split(' ').filter(Boolean) : [];
        });
    }

    private async evaluateRule(title: string, currentTags: string[], rule: TagRule): Promise<boolean> {
        for (const condition of rule.conditions) {
            let result: boolean;
            
            if (condition.type === 'title_set') {
                const set = this.config.titleSets.find(s => s.name === condition.value);
                if (!set) continue;
                result = set.titles.includes(title);
            } else {
                result = currentTags.includes(condition.value);
            }

            // Apply negation if specified
            if (condition.negate) {
                result = !result;
            }

            // For AND conditions, if any condition fails, the whole rule fails
            if (condition.operator === 'and' && !result) {
                return false;
            }
            
            // For OR conditions, if any condition passes, the whole rule passes
            if (condition.operator === 'or' && result) {
                return true;
            }
        }

        // For AND conditions, all conditions passed
        // For OR conditions, no conditions passed
        return rule.conditions[0]?.operator === 'and';
    }

    private async applyTagChanges(page: any, tagState: TagState): Promise<void> {
        try {
            // Combine current tags with changes
            const newTags = [
                ...tagState.currentTags.filter(tag => !tagState.removedTags.includes(tag)),
                ...tagState.addedTags
            ].filter((tag, index, self) => self.indexOf(tag) === index); // Remove duplicates

            // Update tag input
            await page.evaluate((tags: string[]) => {
                const tagInput = document.querySelector('input[name*="TagSelection"][name*="txtTags"]') as HTMLInputElement;
                if (tagInput) {
                    tagInput.value = tags.join(' ');
                    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
                    tagInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, newTags);

            // Save changes
            console.log('Saving changes...');
            await page.click('a.form-button.action-button.action-button--primary[title*="Shortcut: Alt + S"]');
            await page.waitForNavigation({ waitUntil: 'networkidle0' });

            // Verify changes
            console.log('Verifying changes...');
            const updatedTags = await this.getCurrentTags(page);
            const verificationFailed = 
                tagState.addedTags.some(tag => !updatedTags.includes(tag)) ||
                tagState.removedTags.some(tag => updatedTags.includes(tag));

            if (verificationFailed) {
                tagState.verificationStatus = 'failure';
                tagState.error = 'Tag changes verification failed';
                console.log(chalk.red('❌ Tag changes verification failed'));
            } else {
                console.log(chalk.green('✅ Tag changes verified successfully'));
            }

            // Add a small delay before proceeding to next entry
            await page.waitForTimeout(1000);
        } catch (error) {
            tagState.verificationStatus = 'failure';
            tagState.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(chalk.red('Error applying tag changes:'), error);
        }
    }

    private generateReport(): void {
        console.log(chalk.blue('\n=== Operation Report ==='));

        // Title Set Verification Summary
        console.log(chalk.blue('\nTitle Set Verification:'));
        this.titleSetVerifications.forEach(verification => {
            console.log(chalk.blue(`\nSet: ${verification.setName}`));
            console.log(chalk.green(`Found ${verification.foundCount} out of ${verification.expectedCount} titles`));
            if (verification.missingTitles.length > 0) {
                console.log(chalk.yellow(`Missing ${verification.missingTitles.length} titles`));
            }
        });

        // Tag Application Summary
        console.log(chalk.blue('\nTag Application:'));
        let totalProcessed = 0;
        let tagCounts = new Map<string, number>();

        this.tagStates.forEach((state) => {
            totalProcessed++;
            state.addedTags.forEach(tag => {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
        });

        console.log(chalk.blue('\nSummary:'));
        console.log(chalk.green(`Total PRs processed: ${totalProcessed}`));
        tagCounts.forEach((count, tag) => {
            console.log(chalk.green(`Tag "${tag}" added to ${count} entries`));
        });
    }
} 