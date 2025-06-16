import settings from './_settings';
import { writeToFile } from '../../lib/helpers/FileSystem';
import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { createInterface } from 'readline';
import { Page } from 'puppeteer';

let debugSetting = true;

// Get company name from command line arguments
const companyName = process.argv[2];
if (!companyName) {
    console.error('Company name not provided');
    process.exit(1);
}

interface FAQEntry {
  question: string;
  answer: string;
}

interface FAQList {
  name: string;
  href: string;
  entries?: FAQEntry[];
}

// Synchronous prompt function
async function prompt(question: string): Promise<string> {
    const readline = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise<string>((resolve) => {
        readline.question(question, (answer: string) => {
            readline.close();
            resolve(answer);
        });
    });
}

async function scrapeFAQDetails(page: Page, faqHref: string): Promise<FAQEntry[]> {
    const entries: FAQEntry[] = [];

    try {
        // Get all questions first
        console.log('Navigating to FAQ list page...');
        await page.goto(faqHref);
        await waitTillHTMLRendered(page);

        const questions = await page.evaluate(() => {
            const rows = document.querySelectorAll('table.questions tr');
            return Array.from(rows).map(row => {
                const questionSpan = row.querySelector('span[id*="lblQuestion"]');
                const editButton = row.querySelector('input[id*="btnEdit"]');
                if (questionSpan && editButton) {
                    return {
                        question: questionSpan.textContent || '',
                        editId: editButton.id
                    };
                }
                return null;
            }).filter(q => q !== null);
        });

        console.log(`Found ${questions.length} questions`);

        // Now process each question
        for (const q of questions) {
            if (!q) continue; // TypeScript safety check

            console.log(`\nProcessing question: ${q.question}`);
            
            // Navigate to FAQ list page for each question
            console.log('Navigating to FAQ list page...');
            await page.goto(faqHref);
            await waitTillHTMLRendered(page);
            
            // Click the edit button by its ID
            console.log('Clicking edit button...');
            await page.evaluate((buttonId) => {
                const button = document.querySelector(`#${buttonId}`) as HTMLElement;
                if (button) button.click();
            }, q.editId);

            // Wait for the edit form to appear
            await page.waitForSelector('#_ctrl0_ctl19_txtQuestion', { timeout: 5000 })
                .catch(() => console.log('Question input not found after clicking edit'));

            // Get the answer from the iframe with more detailed logging
            console.log('Getting answer from iframe...');
            const answer = await page.evaluate(() => {
                const iframe = document.querySelector('#_ctrl0_ctl19_RADeditor1_contentIframe');
                console.log('Found iframe:', !!iframe);
                
                if (!iframe) return { error: 'No iframe found' };

                const iframeDocument = (iframe as HTMLIFrameElement).contentDocument;
                console.log('Found iframe document:', !!iframeDocument);
                
                if (!iframeDocument) return { error: 'No iframe document found' };

                const body = iframeDocument.querySelector('body.RadEContentBordered');
                console.log('Found body:', !!body);
                console.log('Body content:', body?.innerHTML);
                
                if (!body) return { error: 'No body found' };

                // Get both innerHTML and outerHTML for comparison
                return {
                    content: body.innerHTML,
                    fullContent: body.outerHTML
                };
            });

            console.log('Answer retrieval result:', answer);

            // Handle the answer result
            let finalAnswer = '';
            if ('error' in answer) {
                console.error('Error getting answer:', answer.error);
            } else {
                finalAnswer = answer.content || '';
            }

            entries.push({
                question: q.question,
                answer: finalAnswer
            });

            // Wait a bit before processing next question
            await page.waitForTimeout(1000);
        }

        console.log('\nTotal entries collected:', entries.length);
        return entries;

    } catch (error) {
        const err = error as Error;
        console.error('Error scraping FAQ details:', err.message);
        return entries;
    }
}

async function main() {
    try {
        const { page } = await launchPuppeteer({ 
            headless: true,
            width: 1600,
            height: 900
        });
        
        // Get settings for the specified company
        const companySettings = await settings.getSettingsForCompany(companyName);
        const cms = new CMSService({ 
            url: new URL(companySettings.baseUrlToScrapeFrom),
            page: page 
        });

        console.log('Logging into CMS...');
        await cms.login();

        // Navigate to FAQ page
        const faqPageUrl = new URL('/admin/default.aspx?LanguageId=1&SectionId=6584af41-0d20-43ea-bb53-770a526ad11e', 
            new URL(companySettings.baseUrlToScrapeFrom));
        
        console.log('Navigating to FAQ page...');
        await page.goto(faqPageUrl.toString());
        await waitTillHTMLRendered(page);

        // Get available FAQ lists
        console.log('Getting available FAQ lists...');
        const faqLists = await page.evaluate(() => {
            const lists: FAQList[] = [];
            const rows = document.querySelectorAll('table#_ctrl0_ctl19_UCFaq_dataGrid tr');
            
            Array.from(rows).forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length && !row.classList.contains('DataGridHeader') && !row.classList.contains('DataGridPager')) {
                    const editLink = cells[0].querySelector('a');
                    if (editLink && cells[1] && cells[2]) {
                        lists.push({
                            href: editLink.href,
                            name: cells[1].textContent?.trim() || ''
                        });
                    }
                }
            });
            return lists;
        });

        console.log('Found FAQ lists:', faqLists);

        if (faqLists.length === 0) {
            throw new Error('No live FAQ lists found');
        }

        // Present options to user
        console.log('\nAvailable FAQ Lists:');
        faqLists.forEach((list, index) => {
            console.log(`${index + 1}. ${list.name}`);
        });

        const selection = await prompt('Select FAQ list to scrape (1-' + faqLists.length + '): ');
        const selectedIndex = parseInt(selection) - 1;
        
        if (selectedIndex < 0 || selectedIndex >= faqLists.length) {
            throw new Error('Invalid selection');
        }

        const selectedList = faqLists[selectedIndex];
        console.log(`\nScraping FAQ: ${selectedList.name}`);
        selectedList.entries = await scrapeFAQDetails(page, selectedList.href);

        // Write results to file
        console.log('Writing results to file...');
        writeToFile({
            filename: '01-faq-scraped.json',
            data: JSON.stringify(selectedList, null, 2),
            directory: __dirname
        });

        console.log('Done! Check 01-faq-scraped.json for results');
        process.exit(0);

    } catch (error) {
        const err = error as Error;
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
