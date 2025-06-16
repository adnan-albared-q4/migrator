import settings from './_settings';
import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { CMSService } from '../../lib/services/CMS';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { createInterface } from 'readline';
import { Page } from 'puppeteer';

// Get company name from command line arguments
const companyName = process.argv[2];
if (!companyName) {
    console.error('Company name not provided');
    process.exit(1);
}

interface FAQList {
    name: string;
    href: string;
}

interface FAQQuestion {
    text: string | undefined;
    editButton: string;
}

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

async function deleteExistingFAQs(page: Page, selectedFAQHref: string): Promise<void> {
    try {
        console.log('Starting deletion of existing FAQs...');
        await page.goto(selectedFAQHref);
        await waitTillHTMLRendered(page);

        while (true) {
            // Check for existing FAQs with new selector
            const questions = await page.evaluate(() => {
                const questions: Array<{ text: string | undefined; editButton: string }> = [];
                const rows = Array.from(document.querySelectorAll('tr.question'));
                console.log('Total question rows found:', rows.length);
                
                rows.forEach(row => {
                    const editButton = row.querySelector('input[type="image"][id*="btnEdit"]');
                    const questionSpan = row.querySelector('span[id*="lblQuestion"]');
                    
                    console.log('Edit button found:', !!editButton);
                    console.log('Question span found:', !!questionSpan);
                    console.log('Question text:', questionSpan?.textContent);
                    
                    if (editButton && questionSpan) {
                        questions.push({
                            text: questionSpan.textContent?.trim(),
                            editButton: editButton.id
                        });
                    }
                });
                console.log('Total questions found:', questions.length);
                return questions;
            });

            console.log('Questions found:', questions);

            if (questions.length === 0) {
                console.log('No more FAQs to delete');
                break;
            }

            // Click the edit button for the first question
            console.log(`Deleting FAQ: ${questions[0].text}`);
            await page.click(`#${questions[0].editButton}`);
            await waitTillHTMLRendered(page);

            // Click delete button
            console.log('Clicking delete button...');
            await page.click('input#_ctrl0_ctl19_btnDelete');
            await waitTillHTMLRendered(page);

            // Wait a bit before next deletion
            await page.waitForTimeout(1000);
        }

        console.log('All FAQs deleted successfully!');

    } catch (error) {
        const err = error as Error;
        console.error('Error deleting FAQs:', err.message);
        throw err;
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

        if (faqLists.length === 0) {
            throw new Error('No FAQ lists found');
        }

        // Present options to user
        console.log('\nAvailable FAQ Lists:');
        faqLists.forEach((list, index) => {
            console.log(`${index + 1}. ${list.name}`);
        });

        const selection = await prompt('Select FAQ list to delete entries from (1-' + faqLists.length + '): ');
        const selectedIndex = parseInt(selection) - 1;
        
        if (selectedIndex < 0 || selectedIndex >= faqLists.length) {
            throw new Error('Invalid selection');
        }

        const selectedList = faqLists[selectedIndex];
        const confirmDelete = await prompt(`\nAre you sure you want to delete all FAQs from "${selectedList.name}"? (Y/n): `);
        if (confirmDelete.toLowerCase() === 'n') {
            console.log('Deletion cancelled');
            process.exit(0);
        }

        console.log(`\nDeleting FAQs from: ${selectedList.name}`);
        await deleteExistingFAQs(page, selectedList.href);

        console.log('Done! All FAQs have been deleted.');
        process.exit(0);

    } catch (error) {
        const err = error as Error;
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
