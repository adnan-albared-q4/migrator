import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';

/**
 * Interface for committee data from LLM JSON
 */
interface Committee {
    committee: string;
    attachmentURL: string;
}

/**
 * Interface for LLM data structure
 */
interface LLMData {
    siteName: string;
    analysts: any[];
    committees: Committee[];
    committeeMembers: any[];
}

/**
 * MigrateCommittees Operation
 * 
 * Creates committees in the destination site based on the LLM data.
 * This operation reads the analyst-committee-llm.json file and creates
 * committees that don't already exist in the destination site.
 */
export class MigrateCommittees extends Base {
    private readonly committeeUrl: string;
    private readonly selectors = {
        createButton: '.nui-button.content-header_button.nui-button--citrus.nui-button--square',
        tableRows: 'tr.committee-page-table_body_row',
        committeeName: '.committee-page-table_col_committee-name-label',
        status: '.committee-page-table_col_status .nui-text',
        nameInput: '#CommitteeListEditNameFieldInput',
        saveButton: '#CommitteeListEditWorkflowActionSave',
        loadingIndicator: '.nui-spinner',
        pageTitle: '.content-header_title',
        editForm: '#CommitteeListEditNameFieldInput'
    };

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        this.committeeUrl = `https://${this.site.destination}.s4.q4web.com/admin/studio/#/committee-list`;
    }

    /**
     * Loads committee data from the LLM JSON file
     */
    private async loadCommitteeData(): Promise<Committee[]> {
        try {
            const llmPath = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'analyst-committee-llm.json');
            const llmData: LLMData = JSON.parse(readFileSync(llmPath, 'utf8'));
            const committees = llmData.committees || [];
            console.log(chalk.blue(`Loaded ${committees.length} committees from LLM data`));
            return committees;
        } catch (error) {
            console.error(chalk.red('Error loading committee data:'), error);
            return [];
        }
    }

    /**
     * Gets list of existing committees from the destination site
     */
    private async getExistingCommittees(page: Page): Promise<string[]> {
        try {
            const existing: string[] = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('tr.committee-page-table_body_row'));
                return rows.map(row => {
                    const name = row.querySelector('.committee-page-table_col_committee-name-label')?.textContent?.trim() || '';
                    const status = row.querySelector('.committee-page-table_col_status .nui-text')?.textContent?.trim() || '';
                    return status !== 'For Approval' ? name : '';
                }).filter(Boolean);
            });
            return existing;
        } catch (error) {
            console.error(chalk.red('Error getting existing committees:'), error);
            return [];
        }
    }

    private async verifyListPage(page: Page): Promise<boolean> {
        try {
            const createButton = await page.$(this.selectors.createButton);
            const editForm = await page.$(this.selectors.editForm);
            
            return !!createButton && !editForm;
        } catch (error) {
            console.error(chalk.red('Error verifying list page:'), error);
            return false;
        }
    }

    private async recoverFromError(page: Page): Promise<boolean> {
        try {
            console.log(chalk.yellow('Attempting to recover from error...'));
            
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(5000);

            const loadingIndicator = await page.$(this.selectors.loadingIndicator);
            if (loadingIndicator) {
                await page.waitForFunction(
                    (selector: string) => !document.querySelector(selector),
                    { timeout: 30000 },
                    this.selectors.loadingIndicator
                );
            }

            const isListPage = await this.verifyListPage(page);
            if (isListPage) {
                console.log(chalk.green('Successfully recovered to list page'));
                return true;
            }

            console.error(chalk.red('Failed to recover to list page'));
            return false;
        } catch (error) {
            console.error(chalk.red('Error during recovery:'), error);
            return false;
        }
    }

    private async waitForPageLoad(page: Page, maxRetries = 3): Promise<boolean> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(chalk.blue(`Attempting to load page (attempt ${attempt}/${maxRetries})...`));
                
                await page.goto(this.committeeUrl, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                await page.waitForTimeout(5000);

                const loadingIndicator = await page.$(this.selectors.loadingIndicator);
                if (loadingIndicator) {
                    console.log(chalk.blue('Waiting for loading indicator to disappear...'));
                    await page.waitForFunction(
                        (selector: string) => !document.querySelector(selector),
                        { timeout: 30000 },
                        this.selectors.loadingIndicator
                    );
                }

                const isListPage = await this.verifyListPage(page);
                if (isListPage) {
                    console.log(chalk.green('Successfully loaded committee list page'));
                    return true;
                }

                console.log(chalk.yellow('Not on list page, retrying...'));
            } catch (error) {
                console.error(chalk.red(`Error loading page (attempt ${attempt}/${maxRetries}):`), error);
                if (attempt === maxRetries) {
                    throw new Error(`Failed to load page after ${maxRetries} attempts`);
                }
                await page.waitForTimeout(5000 * attempt);
            }
        }
        return false;
    }

    private async waitForCreateButton(page: Page): Promise<boolean> {
        try {
            const button = await page.$(this.selectors.createButton);
            if (button) return true;

            console.log(chalk.yellow('Create button not found, refreshing page...'));
            const recovered = await this.recoverFromError(page);
            if (!recovered) {
                return false;
            }

            const buttonAfterRefresh = await page.$(this.selectors.createButton);
            if (buttonAfterRefresh) {
                console.log(chalk.green('Create button found after refresh'));
                return true;
            }

            console.error(chalk.red('Create button not found even after refresh'));
            return false;
        } catch (error) {
            console.error(chalk.red('Error waiting for create button:'), error);
            return false;
        }
    }

    /**
     * Main execution method
     */
    public async execute(): Promise<boolean> {
        try {
            // Load committee data from JSON
            const committees = await this.loadCommitteeData();
            if (committees.length === 0) {
                console.log(chalk.yellow('No committees found in LLM data. Nothing to migrate.'));
                return true;
            }

            console.log(chalk.blue('\n=== Starting Committee Migration ==='));
            console.log(chalk.blue(`Total committees in LLM data: ${committees.length}`));
            console.log(chalk.blue(`Committee names: ${committees.map(c => c.committee).join(', ')}`));

            // Get existing committees
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            // Navigate to committee list page with retry logic
            console.log(chalk.blue('\nNavigating to committee list page...'));
            const pageLoaded = await this.waitForPageLoad(page);
            if (!pageLoaded) {
                throw new Error('Failed to load committee list page');
            }

            // Get existing committees
            const existing = await this.getExistingCommittees(page);
            console.log(chalk.blue(`\nFound ${existing.length} existing committees`));
            if (existing.length > 0) {
                console.log(chalk.blue(`Existing committees: ${existing.join(', ')}`));
            }

            // Filter out existing committees
            let committeesToCreate = committees.filter(c => !existing.includes(c.committee));
            console.log(chalk.blue(`\nCommittees to create: ${committeesToCreate.length}`));
            if (committeesToCreate.length > 0) {
                console.log(chalk.blue(`Pending committees: ${committeesToCreate.map(c => c.committee).join(', ')}`));
            } else {
                console.log(chalk.green('\nAll committees already exist. Nothing to create.'));
                return true;
            }

            // Create committees
            let successCount = 0;
            let failureCount = 0;
            let iteration = 1;
            const maxIterations = committeesToCreate.length * 2; // Allow up to 2 attempts per committee

            while (committeesToCreate.length > 0 && iteration <= maxIterations) {
                console.log(chalk.blue(`\n=== Iteration ${iteration} ===`));
                console.log(chalk.blue(`Remaining committees to create: ${committeesToCreate.length}`));
                
                // Get current existing committees (no need to refresh, we're already on the list page)
                const currentExisting = await this.getExistingCommittees(page);
                console.log(chalk.blue(`\nCurrent existing committees: ${currentExisting.join(', ')}`));
                
                // Remove already-present names
                const previousCount = committeesToCreate.length;
                committeesToCreate = committeesToCreate.filter(c => !currentExisting.includes(c.committee));
                if (previousCount !== committeesToCreate.length) {
                    console.log(chalk.green(`\nSome committees were created in previous iterations. Remaining: ${committeesToCreate.length}`));
                }

                if (committeesToCreate.length === 0) {
                    console.log(chalk.green('\nAll committees have been created successfully!'));
                    break;
                }

                const committee = committeesToCreate[0];
                console.log(chalk.blue(`\nAttempting to create committee: ${committee.committee}`));
                
                try {
                    // Verify we're on the list page before proceeding
                    const isListPage = await this.verifyListPage(page);
                    if (!isListPage) {
                        console.log(chalk.yellow('Not on list page, attempting to recover...'));
                        const recovered = await this.recoverFromError(page);
                        if (!recovered) {
                            throw new Error('Failed to recover to list page');
                        }
                    }

                    const buttonFound = await this.waitForCreateButton(page);
                    if (!buttonFound) {
                        throw new Error('Create button not found');
                    }

                    await page.click(this.selectors.createButton);
                    await page.waitForSelector(this.selectors.nameInput, { visible: true, timeout: 10000 });

                    // Set input value using focus and keyboard events
                    await page.click(this.selectors.nameInput, { clickCount: 3 }); // Select all existing text
                    await page.keyboard.press('Backspace'); // Clear existing text
                    await page.keyboard.type(committee.committee); // Type the new name

                    await page.click(this.selectors.saveButton);

                    // Wait for the form/dialog to close and redirect
                    await page.waitForSelector(this.selectors.nameInput, { hidden: true, timeout: 10000 });
                    await page.waitForTimeout(1000);

                    // Verify we're back on the list page
                    const backOnListPage = await this.verifyListPage(page);
                    if (!backOnListPage) {
                        throw new Error('Failed to return to list page after save');
                    }

                    console.log(chalk.green(`Successfully created committee: ${committee.committee}`));
                    successCount++;
                } catch (err) {
                    console.error(chalk.red(`Error creating committee: ${committee.committee}`), err);
                    failureCount++;
                }

                iteration++;
            }

            if (iteration > maxIterations) {
                console.log(chalk.yellow('\nReached maximum iterations. Some committees may not have been created.'));
            }

            // Final summary
            console.log(chalk.blue('\n=== Committee Migration Summary ==='));
            console.log(chalk.green(`Successfully created: ${successCount} committees`));
            if (failureCount > 0) {
                console.log(chalk.yellow(`Failed to create: ${failureCount} committees`));
            }
            console.log(chalk.green('\nCommittee migration complete!'));

            return true;
        } catch (error) {
            console.error(chalk.red(`Error in MigrateCommittees: ${error}`));
            return false;
        }
    }
} 