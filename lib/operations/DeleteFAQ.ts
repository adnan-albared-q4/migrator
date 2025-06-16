import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { LoginManager } from '../core/LoginManager';

interface FAQList {
    name: string;
    href: string;
    status: string;
    lastModifiedBy: string;
}

export class DeleteFAQ extends Base {
    private readonly selectors = {
        faqList: {
            table: 'table.grid-list#_ctrl0_ctl19_UCFaq_dataGrid',
            row: 'tr:not(.DataGridHeader):not(.DataGridPager)',
            nameCell: 'td.DataGridItemBorder:nth-child(2)',
            editLink: 'a.grid-list-action-icon.grid-list-action-edit',
            statusSpan: 'span[id*="lblStatus"]',
            lastModifiedByCell: 'td.DataGridItemBorder:nth-child(3)'
        },
        questions: {
            row: 'tr.question',
            editButton: 'input[type="image"][id*="btnEdit"]',
            questionText: 'span[id*="lblQuestion"]',
            deleteButton: 'input#_ctrl0_ctl19_btnDelete'
        }
    };

    private readonly SECTION_ID = "6584af41-0d20-43ea-bb53-770a526ad11e";

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    async execute(): Promise<boolean> {
        try {
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to initialize page');
            }

            await this.processFAQLists(page);
            return true;
        } catch (error) {
            console.error(chalk.red(`Error in DeleteFAQ: ${error}`));
            return false;
        }
    }

    private async processFAQLists(page: Page): Promise<void> {
        // Navigate to FAQ section
        await this.navigateToFAQList(page);
        console.log(chalk.blue(`\nGetting FAQ lists for ${this.site.name}...`));

        // Get all FAQ lists
        const faqLists = await this.getFAQLists(page);
        
        if (faqLists.length === 0) {
            console.log(chalk.yellow('No FAQ lists found'));
            return;
        }

        console.log(chalk.green('\nFound FAQ lists:'));
        faqLists.forEach(list => {
            console.log(chalk.green(`• "${list.name}" - ${list.status} - Last modified by: ${list.lastModifiedBy}`));
        });

        // Process each FAQ list
        for (const list of faqLists) {
            console.log(chalk.blue(`\nProcessing FAQ list: ${list.name}`));
            await this.deleteQuestionsInList(page, list);
        }
    }

    private async deleteQuestionsInList(page: Page, list: FAQList): Promise<void> {
        try {
            // Navigate to the FAQ list
            console.log(chalk.blue(`Navigating to FAQ list: ${list.name}`));
            await page.goto(list.href);
            await waitTillHTMLRendered(page);

            let questionsDeleted = 0;
            
            while (true) {
                // Check for questions using the original selector
                const hasQuestions = await page.evaluate((selector) => {
                    const rows = document.querySelectorAll(selector);
                    return rows.length > 0;
                }, this.selectors.questions.row);

                if (!hasQuestions) {
                    console.log(chalk.green(`Completed FAQ list "${list.name}" - ${questionsDeleted} questions deleted`));
                    break;
                }

                // Click edit button on first question
                await page.waitForSelector(this.selectors.questions.editButton);
                await page.click(this.selectors.questions.editButton);
                await waitTillHTMLRendered(page);

                // Click delete button and wait for navigation
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0' }),
                    page.click(this.selectors.questions.deleteButton)
                ]);

                questionsDeleted++;
                console.log(chalk.green(`Deleted question ${questionsDeleted} from "${list.name}"`));

                // Wait for page to stabilize
                await waitTillHTMLRendered(page);
                await page.waitForTimeout(1000);
            }
        } catch (error) {
            console.error(chalk.red(`Failed to process FAQ list "${list.name}": ${error}`));
        }
    }

    private async navigateToFAQList(page: Page): Promise<void> {
        const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
        const faqListUrl = new URL(baseUrl);
        faqListUrl.pathname = '/admin/default.aspx';
        faqListUrl.search = `?LanguageId=1&SectionId=${this.SECTION_ID}`;
        
        await page.goto(faqListUrl.toString());
        await this.verifyTableLoaded(page);
    }

    private async verifyTableLoaded(page: Page): Promise<void> {
        await waitTillHTMLRendered(page);
        await page.waitForSelector(this.selectors.faqList.table);
        await page.waitForTimeout(1000);
    }

    private async getFAQLists(page: Page): Promise<FAQList[]> {
        await this.verifyTableLoaded(page);
        
        const faqListSelectors = this.selectors.faqList;
        return await page.evaluate((selectors) => {
            console.log('Looking for rows with selector:', selectors.row);
            const lists: FAQList[] = [];
            const rows = document.querySelectorAll(selectors.row);
            console.log('Found rows:', rows.length);
            
            rows.forEach(row => {
                const nameCell = row.querySelector(selectors.nameCell);
                const editLink = row.querySelector(selectors.editLink) as HTMLAnchorElement;
                const statusSpan = row.querySelector(selectors.statusSpan);
                const lastModifiedByCell = row.querySelector(selectors.lastModifiedByCell);
                
                if (editLink && nameCell) {
                    lists.push({
                        name: nameCell.textContent?.trim() || '',
                        href: editLink.href,
                        status: statusSpan?.textContent?.trim() || '',
                        lastModifiedBy: lastModifiedByCell?.textContent?.trim() || ''
                    });
                }
            });
            
            return lists;
        }, faqListSelectors);
    }
} 