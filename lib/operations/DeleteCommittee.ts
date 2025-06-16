import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';

export class DeleteCommittee extends Base {
    private readonly selectors = {
        committeeList: {
            tableBody: '#CommitteeListTableBody',
            row: '.committee-page-table_body_row',
            status: 'span[id*="StatusValue"]',
            editButton: 'button[id*="EditIcon"]',
        },
        editForm: {
            deleteButton: '#CommitteeListEditWorkflowActionDelete',
        },
        modal: {
            comment: '#ConfimationModalCommentTextArea',
            confirm: '#ConfimationModalActionButton',
        },
    };

    private async navigateToCommitteeList(page: Page): Promise<boolean> {
        const url = `https://${this.site.destination}.s4.q4web.com/admin/studio/#/committee-list`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        try {
            await page.waitForSelector(this.selectors.committeeList.tableBody, { timeout: 5000 });
            await page.waitForTimeout(1000);
            return true;
        } catch {
            return false;
        }
    }

    private async countDeletableItems(page: Page): Promise<number> {
        return await page.evaluate((selectors) => {
            const rows = document.querySelectorAll(selectors.committeeList.row);
            let count = 0;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const statusElement = row.querySelector(selectors.committeeList.status);
                if (statusElement && statusElement.textContent !== 'For Approval') {
                    count++;
                }
            }
            return count;
        }, this.selectors);
    }

    private async deleteNextCommittee(page: Page): Promise<boolean> {
        try {
            // Find first deletable committee
            const editButtonSelector = await page.evaluate((selectors) => {
                const rows = document.querySelectorAll(selectors.committeeList.row);
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const status = row.querySelector(selectors.committeeList.status);
                    if (status && status.textContent !== 'For Approval') {
                        const editButton = row.querySelector(selectors.committeeList.editButton);
                        return editButton ? `#${editButton.id}` : null;
                    }
                }
                return null;
            }, this.selectors);

            if (!editButtonSelector) return false;

            // Click edit button
            const editBtn = await page.$(editButtonSelector);
            if (!editBtn) return false;
            await editBtn.click();
            await page.waitForTimeout(1000);

            // Wait for delete button
            await page.waitForSelector(this.selectors.editForm.deleteButton, { timeout: 5000 });
            await page.click(this.selectors.editForm.deleteButton);
            await page.waitForTimeout(1000);

            // Wait for modal
            await page.waitForSelector(this.selectors.modal.comment, { timeout: 5000 });
            await page.type(this.selectors.modal.comment, 'Deleted as part of content cleanup');
            await page.click(this.selectors.modal.confirm);
            await page.waitForTimeout(1000);

            // Wait for table to reload
            await page.waitForSelector(this.selectors.committeeList.tableBody, { timeout: 3000 });
            return true;
        } catch (error) {
            console.log(chalk.yellow('Error during committee deletion:', error));
            return false;
        }
    }

    async execute(): Promise<boolean> {
        try {
            const page = await this.getPage();
            if (!page) throw new Error('Failed to initialize page');

            if (!await this.navigateToCommitteeList(page)) {
                throw new Error('Failed to navigate to committee list');
            }

            let remainingCount = await this.countDeletableItems(page);
            let previousCount = -1;
            let sameCountAttempts = 0;
            const MAX_STUCK_ATTEMPTS = 10;

            while (remainingCount > 0) {
                if (remainingCount === previousCount) {
                    sameCountAttempts++;
                    if (sameCountAttempts >= MAX_STUCK_ATTEMPTS) {
                        console.log(chalk.red(`Failed to make progress after ${MAX_STUCK_ATTEMPTS} attempts with ${remainingCount} committees remaining. Stopping.`));
                        return false;
                    }
                    if (!await this.navigateToCommitteeList(page)) {
                        throw new Error('Failed to re-navigate to committee list');
                    }
                }
                previousCount = remainingCount;
                if (await this.deleteNextCommittee(page)) {
                    const newCount = await this.countDeletableItems(page);
                    if (newCount < remainingCount) {
                        sameCountAttempts = 0;
                        console.log(chalk.green(`Successfully deleted committee. ${newCount} remaining`));
                    }
                    remainingCount = newCount;
                } else {
                    if (!await this.navigateToCommitteeList(page)) {
                        throw new Error('Failed to re-navigate to committee list after deletion failure');
                    }
                }
            }
            console.log(chalk.green('Committee deletion process complete'));
            return true;
        } catch (error) {
            console.error(chalk.red(`Fatal error in DeleteCommittee: ${error}`));
            return false;
        }
    }
} 