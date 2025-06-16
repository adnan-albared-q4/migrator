import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { LoginManager } from '../core/LoginManager';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { FAQList, FAQQuestion, FAQScrapeResult } from './ScrapeFAQTypes';
import { getSafeSiteDirName } from '../helpers/siteName';

export class MigrateFAQ extends Base {
    private readonly SECTION_ID = '6584af41-0d20-43ea-bb53-770a526ad11e';
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000;
    private page: Page | null = null;

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
    }

    async execute(): Promise<boolean> {
        try {
            console.log(chalk.blue(`\nStarting FAQ migration for ${this.site.name}`));

            // Get page once and reuse it
            this.page = await this.getPage();
            if (!this.page) {
                throw new Error('Failed to get page instance');
            }

            // Read scraped FAQ data
            const faqData = await this.readScrapedData();
            if (!faqData || !faqData.faqLists.length) {
                throw new Error('No FAQ data found. Please run ScrapeFAQ operation first.');
            }

            // Navigate to FAQ page
            const faqPageUrl = new URL('/admin/default.aspx', `https://${this.site.destination}.s4.q4web.com`);
            faqPageUrl.searchParams.append('LanguageId', '1');
            faqPageUrl.searchParams.append('SectionId', this.SECTION_ID);
            
            console.log(chalk.blue('Navigating to FAQ page...'));
            await this.page.goto(faqPageUrl.toString());
            await waitTillHTMLRendered(this.page);

            // Process lists until all are created
            let allListsCreated = false;
            while (!allListsCreated) {
                // Get available FAQ lists
                const availableLists = await this.getAvailableLists();
                console.log(chalk.blue('\nFAQ List Comparison:'));
                
                let missingLists = 0;
                // Compare lists and create missing ones
                for (const scrapedList of faqData.faqLists) {
                    const matchingList = availableLists.find(list => 
                        list.name.toLowerCase() === scrapedList.listName.toLowerCase()
                    );

                    if (matchingList) {
                        console.log(chalk.green(`✓ "${scrapedList.listName}" - Exists`));
                    } else {
                        console.log(chalk.yellow(`✗ "${scrapedList.listName}" - Missing (will be created)`));
                        missingLists++;
                        // Create the missing list
                        await this.createFAQList(scrapedList.listName);
                        // Navigate back to FAQ List page
                        await this.page.goto(faqPageUrl.toString());
                        await waitTillHTMLRendered(this.page);
                        break; // Break to refresh the list comparison
                    }
                }

                // If no missing lists were found, we're done
                if (missingLists === 0) {
                    allListsCreated = true;
                }
            }

            // Get final list of available lists after all creations
            const finalLists = await this.getAvailableLists();

            // Process each scraped FAQ list
            for (const scrapedList of faqData.faqLists) {
                console.log(chalk.blue(`\nProcessing FAQ list: ${scrapedList.listName}`));
                
                // Find matching list in destination
                const matchingList = finalLists.find(list => 
                    list.name.toLowerCase() === scrapedList.listName.toLowerCase()
                );

                if (!matchingList) {
                    console.log(chalk.red(`Failed to find or create list "${scrapedList.listName}", skipping...`));
                    continue;
                }

                // Create FAQs in the matching list
                await this.createFAQs(matchingList.href, scrapedList.questions);
            }

            console.log(chalk.green(`\n✓ FAQ migration completed for ${this.site.name}`));
            return true;

        } catch (error) {
            console.error(chalk.red(`Error in FAQ migration for ${this.site.name}:`), error);
            return false;
        } finally {
            await this.cleanup();
        }
    }

    private async createFAQList(listName: string): Promise<void> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        try {
            console.log(chalk.blue(`Creating FAQ list: ${listName}`));

            // Click Add New button
            await this.page.click('#_ctrl0_ctl19_btnAddNew_submitButton');
            await waitTillHTMLRendered(this.page);

            // Fill in FAQ Name
            await this.page.type('#_ctrl0_ctl19_UCNames_rtrNames_ctl00_txtName', listName);

            // Click Save button
            await this.page.click('#_ctrl0_ctl19_ctl00_btnSave');
            await waitTillHTMLRendered(this.page);

            // Wait for save to complete
            await this.page.waitForTimeout(2000);

            console.log(chalk.green(`✓ Created FAQ list: ${listName}`));
        } catch (error) {
            console.error(chalk.red(`Error creating FAQ list "${listName}":`), error);
            throw error;
        }
    }

    private async readScrapedData(): Promise<FAQScrapeResult | null> {
        const filePath = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'faq.json');
        
        if (!existsSync(filePath)) {
            throw new Error(`FAQ data file not found: ${filePath}`);
        }

        try {
            const rawData = readFileSync(filePath, 'utf8');
            return JSON.parse(rawData) as FAQScrapeResult;
        } catch (error) {
            console.error(chalk.red('Error reading FAQ data:'), error);
            return null;
        }
    }

    private async getAvailableLists(): Promise<Array<{ name: string; href: string }>> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        return this.page.evaluate(() => {
            const lists: Array<{ name: string; href: string }> = [];
            const rows = document.querySelectorAll('#_ctrl0_ctl19_UCFaq_dataGrid tr');
            
            Array.from(rows).forEach(row => {
                if (row.classList.contains('DataGridHeader') || row.classList.contains('DataGridPager')) {
                    return;
                }

                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const editLink = cells[0].querySelector('a[id*="linkEdit"]');
                    const nameCell = cells[1];
                    
                    if (editLink && nameCell) {
                        lists.push({
                            name: nameCell.textContent?.trim() || '',
                            href: (editLink as HTMLAnchorElement).href
                        });
                    }
                }
            });

            return lists;
        });
    }

    private async createFAQs(listHref: string, questions: FAQQuestion[]): Promise<void> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        try {
            // Navigate to FAQ list page
            await this.page.goto(listHref);
            await waitTillHTMLRendered(this.page);

            // Get existing FAQs in the list
            const existingFAQs = await this.getExistingFAQs();
            console.log(chalk.blue(`Found ${existingFAQs.length} existing FAQs in the list`));

            // Process each question
            for (const question of questions) {
                const questionExists = existingFAQs.some(q => 
                    q.toLowerCase() === question.question.toLowerCase()
                );

                if (questionExists) {
                    console.log(chalk.green(`✓ "${question.question}" - Exists`));
                    continue;
                }

                console.log(chalk.blue(`Creating FAQ: ${question.question}`));

                // Click Create New button
                await this.page.click('#_ctrl0_ctl19_btnAddNew_submitButton');
                await waitTillHTMLRendered(this.page);

                // Fill in question
                await this.page.type('#_ctrl0_ctl19_txtQuestion', question.question);

                // Handle answer input
                if (!question.answer) {
                    console.log(chalk.yellow(`Skipping question "${question.question}" - No answer found`));
                    continue;
                }
                await this.handleAnswerInput(question.answer);

                // Save FAQ
                await this.page.click('#_ctrl0_ctl19_btnSave');
                await waitTillHTMLRendered(this.page);

                console.log(chalk.green(`✓ Created FAQ: ${question.question}`));

                // Wait before next entry
                await this.page.waitForTimeout(1000);
            }

        } catch (error) {
            console.error(chalk.red(`Error creating FAQs in list: ${listHref}`), error);
            throw error;
        }
    }

    private async getExistingFAQs(): Promise<string[]> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        return this.page.evaluate(() => {
            const questions: string[] = [];
            const rows = document.querySelectorAll('#_ctrl0_ctl19_UCFaq_dataGrid tr');
            
            Array.from(rows).forEach(row => {
                if (row.classList.contains('DataGridHeader') || row.classList.contains('DataGridPager')) {
                    return;
                }

                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const questionCell = cells[1];
                    if (questionCell) {
                        questions.push(questionCell.textContent?.trim() || '');
                    }
                }
            });

            return questions;
        });
    }

    private async handleAnswerInput(answer: string): Promise<void> {
        if (!this.page) {
            throw new Error('Page not initialized');
        }

        // Step 1: Click HTML mode button
        await this.page.waitForSelector('a.reMode_html');
        await this.page.click('a.reMode_html');
        
        // Verify HTML mode is selected
        const isHtmlMode = await this.page.evaluate(() => {
            const htmlButton = document.querySelector('a.reMode_html');
            return htmlButton?.classList.contains('reMode_selected');
        });

        if (!isHtmlMode) {
            throw new Error('Failed to switch to HTML mode');
        }

        // Step 2: Fill textarea
        await this.page.waitForSelector('textarea.reTextArea');
        await this.page.evaluate((answer) => {
            const textarea = document.querySelector('textarea.reTextArea') as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = answer;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, answer);

        // Step 3: Switch to Design mode
        await this.page.waitForSelector('a.reMode_design');
        await this.page.click('a.reMode_design');
        
        // Verify Design mode is selected
        const isDesignMode = await this.page.evaluate(() => {
            const designButton = document.querySelector('a.reMode_design');
            return designButton?.classList.contains('reMode_selected');
        });

        if (!isDesignMode) {
            throw new Error('Failed to switch to Design mode');
        }

        // Step 4: Verify content in iframe
        const frames = await this.page.frames();
        const editorFrame = frames.find(f => 
            f.name() === '_ctrl0_ctl19_RADeditor1_contentIframe' || 
            f.url().includes('_ctrl0_ctl19_RADeditor1_contentIframe')
        );
        
        if (editorFrame) {
            const iframeContent = await editorFrame.evaluate(() => {
                const body = document.querySelector('body.RadEContentBordered');
                return body?.innerHTML || '';
            });

            if (!iframeContent) {
                throw new Error('Failed to verify content in editor iframe');
            }
        }

        // Add a small delay after setting the answer
        await this.page.waitForTimeout(1000);
    }
} 