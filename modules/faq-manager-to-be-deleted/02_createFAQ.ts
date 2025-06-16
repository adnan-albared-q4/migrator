import settings from './_settings';
import { writeToFile } from '../../lib/helpers/FileSystem';
import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { createInterface } from 'readline';
import { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

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

function convertFAQJson(filename: string): FAQList {
    try {
        const filePath = path.join(process.cwd(), 'scraperMetadata', filename);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const rawData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);

        // Validate the structure
        if (!jsonData.entries || !Array.isArray(jsonData.entries)) {
            throw new Error('Invalid FAQ data structure');
        }

        // Convert to FAQList type
        const faqList: FAQList = {
            name: 'Scraped FAQ',
            href: '',
            entries: jsonData.entries.map((entry: FAQEntry) => ({
                question: entry.question || '',
                answer: entry.answer || ''
            }))
        };

        return faqList;
    } catch (error) {
        const err = error as Error;
        console.error('Error converting FAQ JSON:', err.message);
        throw err;
    }
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
            resolve(answer.trim());
        });
    });
}

async function addFAQEntries(page: Page, selectedFAQHref: string, faqData: FAQList): Promise<void> {
    try {
        // Navigate to selected FAQ page
        console.log('Navigating to selected FAQ page...');
        await page.goto(selectedFAQHref);
        await waitTillHTMLRendered(page);

        // Process each FAQ entry
        for (const entry of faqData.entries || []) {
            console.log(`\nCreating FAQ: ${entry.question}`);

            // Click Create New button
            console.log('Clicking Create New button...');
            await page.click('#_ctrl0_ctl19_btnAddNew_submitButton');
            await waitTillHTMLRendered(page);

            // Fill in question
            console.log('Filling in question...');
            await page.type('#_ctrl0_ctl19_txtQuestion', entry.question);

            // Fill in answer - new step by step approach
            console.log('Starting answer input process...');

            // Step 1: Click HTML mode button
            console.log('Step 1: Clicking HTML mode button...');
            await page.waitForSelector('a.reMode_html');
            await page.click('a.reMode_html');
            
            // Verify HTML mode is selected
            const isHtmlMode = await page.evaluate(() => {
                const htmlButton = document.querySelector('a.reMode_html');
                return htmlButton?.classList.contains('reMode_selected');
            });
            console.log('HTML mode selected:', isHtmlMode);

            // Step 2: Focus and fill textarea
            console.log('Step 2: Finding and filling textarea...');
            await page.waitForSelector('textarea.reTextArea');
            const textareaExists = await page.evaluate((answer) => {
                const textarea = document.querySelector('textarea.reTextArea');
                if (textarea) {
                    (textarea as HTMLTextAreaElement).value = answer;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            }, entry.answer);
            console.log('Textarea found and filled:', textareaExists);

            // Step 3: Click Design mode button
            console.log('Step 3: Clicking Design mode button...');
            await page.waitForSelector('a.reMode_design');
            await page.click('a.reMode_design');
            
            // Verify Design mode is selected
            const isDesignMode = await page.evaluate(() => {
                const designButton = document.querySelector('a.reMode_design');
                return designButton?.classList.contains('reMode_selected');
            });
            console.log('Design mode selected:', isDesignMode);

            // Step 4: Verify content in iframe
            console.log('Step 4: Verifying content in iframe...');
            const frames = await page.frames();
            const editorFrame = frames.find(f => f.name() === '_ctrl0_ctl19_RADeditor1_contentIframe' || 
                                               f.url().includes('_ctrl0_ctl19_RADeditor1_contentIframe'));
            
            if (editorFrame) {
                const iframeContent = await editorFrame.evaluate(() => {
                    const body = document.querySelector('body.RadEContentBordered');
                    return body?.innerHTML || '';
                });
                console.log('Iframe content length:', iframeContent.length);
            }

            // Add a small delay after setting the answer
            await page.waitForTimeout(1000);

            // Save FAQ
            console.log('Saving FAQ...');
            await page.click('#_ctrl0_ctl19_btnSave');
            await waitTillHTMLRendered(page);

            // Wait a bit before next entry
            await page.waitForTimeout(1000);
        }

        console.log('\nAll FAQs created successfully!');

    } catch (error) {
        const err = error as Error;
        console.error('Error adding FAQ entries:', err.message);
        throw err;
    }
}

// Modify main function to include deletion option
async function main() {
    try {
        // Read scraped FAQ data
        console.log('Reading scraped FAQ data...');
        const faqData = convertFAQJson('01-faq-scraped.json');
        
        if (!faqData || !faqData.entries) {
            throw new Error('No FAQ data found or invalid format. Please run step 1 first.');
        }

        const { page } = await launchPuppeteer({ 
            headless: true,
            width: 1600,
            height: 900
        });
                
        // Get settings for the specified company
        const companySettings = await settings.getSettingsForCompany(companyName);
        const cms = new CMSService({ 
            url: new URL(companySettings.baseUrlToCreateTo),
            page: page 
        });

        console.log('Logging into CMS...');
        await cms.login();

        // Navigate to FAQ page
        const faqPageUrl = new URL('/admin/default.aspx?LanguageId=1&SectionId=6584af41-0d20-43ea-bb53-770a526ad11e', 
            companySettings.baseUrlToCreateTo);
        
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
                    if (editLink && cells[1]) {
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
            throw new Error('No FAQ lists found');
        }

        // Present options to user
        console.log('\nAvailable FAQ Lists:');
        faqLists.forEach((list, index) => {
            console.log(`${index + 1}. ${list.name}`);
        });

        const selection = await prompt('Select FAQ list to add entries to (1-' + faqLists.length + '): ');
        const selectedIndex = parseInt(selection) - 1;
        
        if (selectedIndex < 0 || selectedIndex >= faqLists.length) {
            throw new Error('Invalid selection');
        }

        const selectedList = faqLists[selectedIndex];
        console.log(`\nAdding FAQs to: ${selectedList.name}`);
        await addFAQEntries(page, selectedList.href, faqData);

        console.log('Done! All FAQs have been created.');
        process.exit(0);

    } catch (error) {
        const err = error as Error;
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
