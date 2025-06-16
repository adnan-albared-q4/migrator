import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { LoginManager } from '../core/LoginManager';

/**
 * Implementation Steps:
 * 
 * 1. Initial Navigation:
 *    - Start from dashboard
 *    - Navigate to Angular app URL: /admin/studio/#/analyst-groups
 *    - Wait for Angular to load
 * 
 * 2. Analyst Groups Page:
 *    - Verify we're on analyst groups page
 *    - Find and click first analyst group edit button
 *    - Wait for navigation to complete
 * 
 * 3. Analyst List Page:
 *    - Verify analyst table is loaded
 *    - Find all analyst rows
 *    - For each analyst:
 *      - Store name, firm, and edit button ID
 *    - Build deletion queue
 * 
 * 4. Deletion Process:
 *    For each analyst in queue:
 *    - Click edit button for analyst
 *    - Wait for edit form to load
 *    - Click delete button
 *    - Wait for modal to appear
 *    - Enter comment in modal
 *    - Click confirm in modal
 *    - Wait for navigation back to list
 *    - Verify back on list page
 *    - Wait before next deletion
 * 
 * 5. Error Handling:
 *    - Retry clicks if elements not immediately available
 *    - Verify correct page state after each navigation
 *    - Log all actions and errors
 *    - Continue with next analyst if one fails
 */

type PageState = 'landing' | 'analystGroups' | 'list' | 'edit';

export class DeleteAnalyst extends Base {
    private readonly selectors = {
        // Dashboard Page (from Base class)
        dashboard: {
            title: 'h1.page-title span.ModuleTitle'
        },

        // Analyst Groups Page
        analystGroups: {
            header: '#AnalystGroupsHeaderTitleText',
            editButton: 'button#AnalystGroupsTableBodyTableItemsItem0EditIcon'
        },

        // Analyst List Page
        analystList: {
            header: '#AnalystGroupsHeaderTitleText',
            tableBody: '#AnalystGroupsFormAnalystTableBody',
            table: 'table#AnalystGroupsFormAnalystTableTable',
            addNew: '#AnalystGroupsFormAnalystTableHeaderAddNew',
            row: '.analyst-table_body_row',
            status: 'span[id*="StatusValue"]',
            editButton: 'button[id*="EditIcon"]'
        },

        // Edit Form
        editForm: {
            nameInput: '#AnalystGroupsAnalystFormNameFieldInput',
            firmInput: '#AnalystGroupsAnalystFormFirmFieldInput',
            submitButton: '#AnalystGroupsAnalystFormWorkflowActionSubmit'
        },

        // Delete Modal
        modal: {
            comment: '#ConfimationModalCommentTextArea',
            confirm: '#ConfimationModalActionButton'
        }
    };

    /**
     * Map selectors to their expected page states
     */
    private readonly selectorPageStates: Record<string, PageState> = {
        // Analyst Groups Page
        'button#AnalystGroupsTableBodyTableItemsItem0EditIcon': 'analystGroups',
        
        // Analyst List Page
        '#AnalystGroupsFormAnalystTableBody': 'list',
        '#AnalystGroupsFormAnalystTableTable': 'list',
        '#AnalystGroupsFormAnalystTableHeaderAddNew': 'list',
        
        // Edit Form
        '#AnalystGroupsAnalystFormNameFieldInput': 'edit',
        '#AnalystGroupsAnalystFormFirmFieldInput': 'edit',
        '#AnalystGroupsAnalystFormWorkflowActionSubmit': 'edit',
        '#AnalystGroupsAnalystFormWorkflowActionDelete': 'edit'
    };

    private isDebugMode = false; // Add debug flag

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    /**
     * Quick check for element existence without waiting
     */
    private async quickCheck(page: Page, selector: string): Promise<boolean> {
        try {
            const element = await page.$(selector);
            return !!element;
        } catch (error) {
            console.log(chalk.yellow(`Quick check failed for ${selector}`));
            return false;
        }
    }

    /**
     * Detect current page state
     */
    private async detectCurrentPage(page: Page): Promise<PageState> {
        // Quick check for edit page
        const editChecks = [
            this.selectors.editForm.nameInput,
            this.selectors.editForm.firmInput,
            this.selectors.editForm.submitButton
        ];
        let allFound = true;
        for (const selector of editChecks) {
            if (!await this.quickCheck(page, selector)) {
                allFound = false;
                break;
            }
        }
        if (allFound) return 'edit';

        // Quick check for list page
        if (await this.quickCheck(page, this.selectors.analystList.table) &&
            await this.quickCheck(page, this.selectors.analystList.addNew)) {
            return 'list';
        }

        // Quick check for analyst groups page
        if (await this.quickCheck(page, this.selectors.analystGroups.editButton)) {
            return 'analystGroups';
        }

        return 'landing';
    }

    /**
     * Navigate to target state with retries
     */
    private async navigateToState(page: Page, targetState: PageState, maxAttempts = 3): Promise<boolean> {
        const startTime = Date.now();
        const currentState = await this.detectCurrentPage(page);
        
        await this.debugStep(`Current page state detected as: ${currentState}`);
        
        if (currentState === targetState) {
            await this.debugStep(`Already at target state: ${targetState}`);
            return true;
        }

        console.log(chalk.blue(`Navigating from ${currentState} to ${targetState}...`));

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0) {
                console.log(chalk.yellow(`Retrying navigation to ${targetState} (attempt ${attempt + 1}/${maxAttempts})`));
                await this.debugStep(`Retry attempt ${attempt + 1}/${maxAttempts} to navigate to ${targetState}`);
            }

            try {
                switch (targetState) {
                    case 'analystGroups':
                        // Always use direct URL navigation for analystGroups regardless of current state
                        await this.debugStep(`Navigating to analystGroups via URL`);
                        const url = `https://${this.site.destination}.s4.q4web.com/admin/studio/#/analyst-groups`;
                        await page.goto(url, { waitUntil: 'domcontentloaded' });
                        // Quick stability check instead of full HTML render
                        await this.debugStep(`Waiting for analystGroups edit button to appear`);
                        await page.waitForSelector(this.selectors.analystGroups.editButton, { timeout: 5000 });
                        // Wait for Angular to stabilize
                        await page.waitForTimeout(1000);
                        break;

                    case 'list':
                        if (currentState === 'analystGroups') {
                            await this.debugStep(`Clicking edit button to navigate to list page`);
                            if (!await this.safelyClick(page, this.selectors.analystGroups.editButton)) {
                                continue;
                            }
                            // Wait for table instead of full HTML render
                            await this.debugStep(`Waiting for analyst list table to appear`);
                            await page.waitForSelector(this.selectors.analystList.table, { timeout: 5000 });
                            // Wait for Angular to stabilize
                            await page.waitForTimeout(1000);
                        }
                        break;
                }

                // Quick state check
                const newState = await this.detectCurrentPage(page);
                await this.debugStep(`After navigation, new state is: ${newState}`);
                
                if (newState === targetState) {
                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(chalk.green(`Navigation completed in ${duration}s`));
                    return true;
                }

                await page.waitForTimeout(500); // Reduced timeout between attempts
            } catch (error) {
                await this.debugStep(`Navigation error: ${error}`);
                console.error(chalk.red(`Navigation error:`, error));
                if (attempt === maxAttempts - 1) return false;
            }
        }

        await this.debugStep(`Failed to navigate to ${targetState} after ${maxAttempts} attempts`);
        console.log(chalk.red(`Failed to navigate to ${targetState} after ${maxAttempts} attempts`));
        return false;
    }

    /**
     * Count remaining deletable items
     */
    private async countDeletableItems(page: Page): Promise<number> {
        return await page.evaluate((selectors) => {
            const rows = document.querySelectorAll(selectors.analystList.row);
            let count = 0;
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const statusElement = row.querySelector(selectors.analystList.status);
                if (statusElement && statusElement.textContent !== 'For Approval') {
                    count++;
                }
            }
            
            return count;
        }, this.selectors);
    }

    /**
     * Attempt to recover when a selector is not found
     */
    private async recoverSelector(page: Page, selector: string, maxAttempts = 3): Promise<boolean> {
        const expectedState = this.selectorPageStates[selector];
        if (!expectedState) {
            console.log(chalk.yellow(`No expected state defined for selector: ${selector}`));
            return false;
        }

        const currentState = await this.detectCurrentPage(page);
        console.log(chalk.yellow(`Selector "${selector}" not found. Current state: ${currentState}, Expected state: ${expectedState}`));

        if (currentState !== expectedState) {
            console.log(chalk.yellow(`Attempting to navigate to correct state: ${expectedState}`));
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (attempt > 0) {
                    console.log(chalk.yellow(`Recovery attempt ${attempt + 1}/${maxAttempts}`));
                }

                if (await this.navigateToState(page, expectedState)) {
                    // After navigation, check if selector is now present
                    try {
                        await page.waitForSelector(selector, { timeout: 2000 });
                        console.log(chalk.green(`Successfully recovered selector after navigation`));
                        return true;
                    } catch {
                        if (attempt === maxAttempts - 1) {
                            console.log(chalk.yellow(`Selector still not found after navigation recovery`));
                            return false;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Safely click an element with retries and recovery
     */
    private async safelyClick(page: Page, selector: string): Promise<boolean> {
        // Try quick checks first
        for (let i = 0; i < 3; i++) {
            try {
                const element = await page.$(selector);
                if (element) {
                    await element.click();
                    return true;
                }
                
                // If element not found, try to recover
                if (i === 0) { // Only try recovery on first failure
                    if (await this.recoverSelector(page, selector)) {
                        continue; // Try clicking again after recovery
                    }
                }
                
                await page.waitForTimeout(100);
            } catch {
                continue;
            }
        }

        console.log(chalk.yellow(`Failed to click ${selector} after recovery attempts`));
        return false;
    }

    /**
     * Safely wait for selector with recovery attempts
     */
    private async safelyWaitForSelector(page: Page, selector: string, timeout = 5000): Promise<boolean> {
        try {
            await page.waitForSelector(selector, { timeout });
            return true;
        } catch {
            console.log(chalk.yellow(`Selector not found: ${selector}`));
            return await this.recoverSelector(page, selector);
        }
    }

    /**
     * Debug step function to wait for user input
     */
    private async debugStep(message: string): Promise<void> {
        if (!this.isDebugMode) return;

        console.log(chalk.cyan(`\n=== DEBUG STEP: ${message} ===`));
        console.log(chalk.cyan('Press Enter to continue...'));
        
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise<void>((resolve) => {
            readline.question('', () => {
                readline.close();
                resolve();
            });
        });
    }

    /**
     * Find and delete the next available analyst
     */
    private async deleteNextAnalyst(page: Page): Promise<boolean> {
        try {
            await this.debugStep('Searching for analysts not in "For Approval" status');
            // Find first non-"For Approval" analyst and delete
            const editButtonSelector = await page.evaluate((selectors) => {
                const rows = document.querySelectorAll(selectors.analystList.row);
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const status = row.querySelector(selectors.analystList.status);
                    if (status && status.textContent !== 'For Approval') {
                        const editButton = row.querySelector(selectors.analystList.editButton);
                        return editButton ? editButton.id : null;
                    }
                }
                return null;
            }, this.selectors);

            if (!editButtonSelector) {
                await this.debugStep('No analysts found to delete');
                return false;
            }

            await this.debugStep(`Found an analyst to delete, edit button ID: ${editButtonSelector}`);
            
            // Click edit button and wait for form
            await this.debugStep('Clicking edit button to open analyst edit form');
            if (!await this.safelyClick(page, `#${editButtonSelector}`)) {
                await this.debugStep('Failed to click edit button');
                return false;
            }

            // Wait for Angular to stabilize after edit button click
            await this.debugStep('Waiting for Angular to stabilize after edit button click');
            await page.waitForTimeout(1000);

            // Wait for form with recovery
            await this.debugStep('Waiting for edit form to be visible');
            if (!await this.safelyWaitForSelector(page, this.selectors.editForm.submitButton)) {
                await this.debugStep('Edit form submit button not found');
                return false;
            }

            // Click delete button and wait for modal
            await this.debugStep('Looking for delete button on edit form');
            const deleteButton = '#AnalystGroupsAnalystFormWorkflowActionDelete';
            await this.debugStep('Clicking delete button');
            if (!await this.safelyClick(page, deleteButton)) {
                await this.debugStep('Failed to click delete button');
                return false;
            }
            
            // Wait for Angular to stabilize after delete button click
            await this.debugStep('Waiting for Angular to stabilize after delete button click');
            await page.waitForTimeout(1000);
            
            // Wait for modal with recovery
            await this.debugStep('Waiting for confirmation modal to appear');
            if (!await this.safelyWaitForSelector(page, this.selectors.modal.comment)) {
                await this.debugStep('Confirmation modal not found');
                return false;
            }
            
            // Handle modal
            await this.debugStep('Entering deletion comment in modal');
            await page.type(this.selectors.modal.comment, 'Deleted as part of content cleanup');

            await this.debugStep('Clicking confirm button in modal');
            if (!await this.safelyClick(page, this.selectors.modal.confirm)) {
                await this.debugStep('Failed to click confirm button');
                return false;
            }

            // Static wait after confirming deletion
            await this.debugStep('Waiting after deletion confirmation');
            await page.waitForTimeout(1000);

            await this.debugStep('Waiting for table to reload after deletion');
            
            // Modified: Use native Puppeteer waitForSelector with longer timeout 
            try {
                await this.debugStep('Using Puppeteer waitForSelector with 3s timeout');
                await page.waitForSelector(
                    `${this.selectors.analystList.table} ${this.selectors.analystList.row}`, 
                    { timeout: 3000 }
                );
                await this.debugStep('Table reload successful after deletion');
                return true;
            } catch (waitError) {
                await this.debugStep(`Table reload timeout: ${waitError}`);
                console.log(chalk.yellow(`Table reload timeout after deletion: ${waitError}`));
                return false;
            }
        } catch (error) {
            await this.debugStep(`Error during deletion: ${error}`);
            console.log(chalk.yellow('Error during deletion, will continue with next analyst:', error));
            return false;
        }
    }

    async execute(): Promise<boolean> {
        try {
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            await this.debugStep('Starting DeleteAnalyst operation');

            let remainingCount = 0;
            let previousCount = -1;
            let sameCountAttempts = 0;
            const MAX_STUCK_ATTEMPTS = 10;

            // Initial navigation to analystGroups and list - only done once
            await this.debugStep('Initial navigation to analyst groups page');
            if (!await this.navigateToState(page, 'analystGroups')) {
                throw new Error('Failed to navigate to analyst groups');
            }

            await this.debugStep('Initial navigation to analyst list page');
            if (!await this.navigateToState(page, 'list')) {
                throw new Error('Failed to navigate to analyst list');
            }

            // Get initial count
            await this.debugStep('Counting analysts to delete');
            remainingCount = await this.countDeletableItems(page);
            console.log(chalk.blue(`Found ${remainingCount} analysts to delete`));
            if (remainingCount === 0) {
                return true; // Nothing to delete
            }

            // Main deletion loop - no navigation unless error occurs
            while (remainingCount > 0) {
                try {
                    // Check if we're stuck
                    if (remainingCount === previousCount) {
                        sameCountAttempts++;
                        if (sameCountAttempts >= MAX_STUCK_ATTEMPTS) {
                            console.log(chalk.red(`Failed to make progress after ${MAX_STUCK_ATTEMPTS} attempts with ${remainingCount} analysts remaining. Stopping.`));
                            return false;
                        }
                        console.log(chalk.yellow(`Same count detected (${remainingCount}), attempt ${sameCountAttempts}/${MAX_STUCK_ATTEMPTS}`));
                        await this.debugStep(`No progress detected - attempt ${sameCountAttempts}/${MAX_STUCK_ATTEMPTS}`);

                        // Only re-navigate if we're stuck
                        await this.debugStep('Re-navigating to analyst groups page due to lack of progress');
                        if (!await this.navigateToState(page, 'analystGroups')) {
                            throw new Error('Failed to navigate to analyst groups');
                        }

                        await this.debugStep('Re-navigating to analyst list page');
                        if (!await this.navigateToState(page, 'list')) {
                            throw new Error('Failed to navigate to analyst list');
                        }
                    }

                    previousCount = remainingCount;

                    // Try to delete next analyst directly from current list page
                    await this.debugStep('Attempting to delete next analyst');
                    if (await this.deleteNextAnalyst(page)) {
                        await this.debugStep('Verifying deletion success and counting remaining analysts');
                        const newCount = await this.countDeletableItems(page);
                        if (newCount < remainingCount) {
                            // Progress made, reset stuck counter
                            sameCountAttempts = 0;
                            console.log(chalk.green(`Successfully deleted analyst. ${newCount} remaining`));
                        }
                        remainingCount = newCount;
                    } else {
                        // If deletion fails, restart by navigating back to analystGroups
                        await this.debugStep('Deletion attempt failed, re-navigating to analyst groups page');
                        console.log(chalk.yellow(`Deletion attempt failed, restarting navigation`));
                        
                        if (!await this.navigateToState(page, 'analystGroups')) {
                            throw new Error('Failed to navigate to analyst groups after deletion failure');
                        }

                        await this.debugStep('Re-navigating to analyst list page');
                        if (!await this.navigateToState(page, 'list')) {
                            throw new Error('Failed to navigate to analyst list after deletion failure');
                        }
                    }

                } catch (error) {
                    // Any selector error or other error = restart navigation
                    await this.debugStep(`Error occurred: ${error}, re-navigating`);
                    console.log(chalk.yellow(`Error occurred, restarting navigation: ${error}`));
                    
                    // Try to recover by going back to analystGroups page
                    if (!await this.navigateToState(page, 'analystGroups')) {
                        throw new Error('Failed to navigate to analyst groups after error');
                    }

                    if (!await this.navigateToState(page, 'list')) {
                        throw new Error('Failed to navigate to analyst list after error');
                    }
                }
            }

            await this.debugStep('Deletion process complete');
            console.log(chalk.green('Deletion process complete'));
            return true;

        } catch (error) {
            console.error(chalk.red(`Fatal error in DeleteAnalyst: ${error}`));
            return false;
        }
    }

    // Add method to enable debug mode
    public enableDebugMode(): void {
        this.isDebugMode = true;
        console.log(chalk.cyan('Debug mode enabled - will pause for input at each step'));
    }
} 