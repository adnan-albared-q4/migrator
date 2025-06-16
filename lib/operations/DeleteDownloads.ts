import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { LoginManager } from '../core/LoginManager';
import * as readline from 'readline';

interface DownloadItem {
    title: string;
    editUrl: string;
    status: string;
    lastModifiedBy: string;
}

export class DeleteDownloads extends Base {
    private readonly SECTION_ID = "184b727d-3857-4ca6-b4fc-6436fb81ca30";
    private readonly GOVERNANCE_DOCUMENTS_ID = "a880db05-d76d-4442-811f-4cbf4e47d762";
    private isDebugMode = false;
    
    private readonly selectors = {
        downloadList: {
            typeSelect: '#_ctrl0_ctl19_ddlReportType',
            table: '#_ctrl0_ctl19_UCReports2_dataGrid',
            tbody: '#_ctrl0_ctl19_UCReports2_dataGrid tbody',
            row: 'tr',
            editLink: 'a.grid-list-action-icon.grid-list-action-edit',
            titleCell: 'td.DataGridItemBorder:nth-child(3)',
            statusCell: 'span.ToDoListLabel',
            lastModifiedByCell: 'td.DataGridItemBorder:nth-child(4)'
        },
        editPage: {
            commentsField: '#_ctrl0_ctl19_ctl00_txtComments',
            deleteButton: '#_ctrl0_ctl19_ctl00_btnDelete'
        }
    };

    private deletionQueue: DownloadItem[] = [];

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    /**
     * Debug step function to wait for user input
     */
    private async debugStep(message: string): Promise<void> {
        if (!this.isDebugMode) return;

        console.log(chalk.cyan(`\nDEBUG STEP: ${message}`));
        console.log(chalk.cyan('Press Enter to continue...'));
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise<void>((resolve) => {
            rl.question('', () => {
                rl.close();
                resolve();
            });
        });
    }

    async execute(): Promise<boolean> {
        try {
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            await this.debugStep('Starting discovery phase');
            // Phase 1: Discovery
            await this.discoveryPhase(page);
            this.logDeletionQueue();

            await this.debugStep('Starting deletion phase');
            // Phase 2: Deletion
            await this.deletionPhase(page);

            return true;
        } catch (error) {
            console.error(chalk.red(`Error in DeleteDownloads: ${error}`));
            return false;
        }
    }

    private async discoveryPhase(page: Page): Promise<void> {
        await this.debugStep('Navigating to download list');
        await this.navigateToDownloadList(page);
        console.log(chalk.blue(`\nStarting discovery phase for ${this.site.name}...`));

        await this.debugStep('Getting download items');
        const downloads = await this.getDownloadItems(page);
        this.deletionQueue = downloads;
        
        console.log(chalk.green(`Found ${downloads.length} deletable downloads`));
    }

    private async deletionPhase(page: Page): Promise<void> {
        console.log(chalk.blue('\nStarting deletion phase...'));
        let processed = 0;
        const total = this.deletionQueue.length;

        for (const item of this.deletionQueue) {
            await this.debugStep(`Deleting item: ${item.title}`);
            try {
                await this.deleteDownload(page, item);
                processed++;
                console.log(chalk.green(`Deleted "${item.title}" (${processed}/${total})`));
            } catch (error) {
                console.error(chalk.red(`Failed to delete "${item.title}": ${error}`));
            }

            // Add a small delay between deletions
            await page.waitForTimeout(1000);
        }

        console.log(chalk.green(`\nDeletion phase complete. Processed ${processed}/${total} entries`));
    }

    private async navigateToDownloadList(page: Page): Promise<void> {
        const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
        const downloadListUrl = new URL(baseUrl);
        downloadListUrl.pathname = '/admin/default.aspx';
        downloadListUrl.search = `?LanguageId=1&SectionId=${this.SECTION_ID}`;
        
        await page.goto(downloadListUrl.toString());
        await this.verifyTableLoaded(page);
    }

    private async verifyTableLoaded(page: Page): Promise<void> {
        // Just wait for HTML to render
        await waitTillHTMLRendered(page);
    }

    private async getDownloadItems(page: Page): Promise<DownloadItem[]> {
        try {
            // Select governance documents first
            await page.waitForSelector(this.selectors.downloadList.typeSelect);
            await page.select(this.selectors.downloadList.typeSelect, this.GOVERNANCE_DOCUMENTS_ID);
            
            // Wait for HTML to render after selection
            await waitTillHTMLRendered(page);

            // Get items from table
            const items = await page.evaluate((selectors) => {
                const rows = document.querySelectorAll('#_ctrl0_ctl19_UCReports2_dataGrid tr:not(.DataGridHeader):not(.DataGridPager)');
                console.log(`Found ${rows.length} total rows`);
                
                return Array.from(rows).map(row => {
                    const editLink = row.querySelector('a.grid-list-action-icon.grid-list-action-edit') as HTMLAnchorElement;
                    const titleCell = row.querySelector('td.DataGridItemBorder:nth-child(3)');
                    const statusSpan = row.querySelector('span.ToDoListLabel');
                    const lastModifiedByCell = row.querySelector('td.DataGridItemBorder:nth-child(4)');
                    
                    return {
                        title: titleCell?.textContent?.trim() || '',
                        editUrl: editLink?.href || '',
                        status: statusSpan?.textContent?.trim() || '',
                        lastModifiedBy: lastModifiedByCell?.textContent?.trim() || ''
                    };
                }).filter(item => 
                    item.editUrl && 
                    item.title && 
                    !item.status.includes('For Approval')
                );
            }, this.selectors.downloadList);

            console.log(chalk.green(`Found ${items.length} deletable downloads`));
            items.forEach((item, index) => {
                console.log(chalk.blue(`${index + 1}. "${item.title}" - ${item.status}`));
            });

            return items;
        } catch (error) {
            console.error(chalk.red('Error getting download items:', error));
            return [];
        }
    }

    private async deleteDownload(page: Page, item: DownloadItem): Promise<void> {
        await this.debugStep(`Navigating to edit page for: ${item.title}`);
        // Navigate to edit page
        await page.goto(item.editUrl);
        await waitTillHTMLRendered(page);
        
        await this.debugStep('Entering deletion comment');
        // Fill comment field
        await page.waitForSelector(this.selectors.editPage.commentsField);
        await page.type(this.selectors.editPage.commentsField, 'Deleted as part of content cleanup');
        
        await this.debugStep('Clicking delete button');
        // Click delete button and wait for navigation
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click(this.selectors.editPage.deleteButton)
        ]);

        await this.debugStep('Verifying return to list page');
        // Verify we're back on the list page
        await this.verifyTableLoaded(page);
    }

    private logDeletionQueue(): void {
        console.log(chalk.yellow('\nDeletion Queue Summary:'));
        console.log(chalk.yellow(`Total entries to process: ${this.deletionQueue.length}`));
        
        if (this.deletionQueue.length > 0) {
            console.log(chalk.yellow('\nItems to be deleted:'));
            this.deletionQueue.forEach((item, index) => {
                console.log(chalk.yellow(`${index + 1}. "${item.title}" - ${item.status} - Last modified by: ${item.lastModifiedBy}`));
            });
        }
    }

    // Add method to enable debug mode
    public enableDebugMode(): void {
        this.isDebugMode = true;
        console.log(chalk.cyan('Debug mode enabled - will pause for input at each step'));
    }
} 