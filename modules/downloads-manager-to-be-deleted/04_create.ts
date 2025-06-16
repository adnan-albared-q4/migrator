import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { DownloadLists } from '../../lib/data/DownloadLists';
import { writeToFile } from '../../lib/helpers/FileSystem';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import { State } from '../../lib/data/State';

// Load environment variables
dotenv.config();

declare global {
  interface Window {
    updateText: (input: HTMLInputElement, value: string) => void;
    updateSelect: (name: string, value: string | number) => void;
  }
}

async function ensureLogin(page: puppeteer.Page): Promise<void> {
  if (page.url().includes('/login')) {
    console.log('🔑 Logging in...');
    try {
      // Wait for username field with a 30-second timeout
      await page.waitForSelector('#txtUserName', { timeout: 30000 });
      
      // Perform login
      await page.evaluate(() => {
        (document.querySelector<HTMLInputElement>("#txtUserName")!).value = process.env.CMS_USER || '';
        (document.querySelector<HTMLInputElement>("#txtPassword")!).value = process.env.CMS_PASSWORD || '';
        (document.querySelector<HTMLButtonElement>("#btnSubmit")!).click();
      });

      // Wait for navigation with a 30-second timeout
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
        waitTillHTMLRendered(page)
      ]);

      // Short delay to ensure everything is loaded
      await page.waitForTimeout(2000);
      console.log('✅ Login successful');
    } catch (error) {
      const err = error as Error;
      console.error('❌ Login failed:', err.message);
      throw err;
    }
  }
}

async function goToDownloadPage(page: puppeteer.Page, baseUrl: URL): Promise<void> {
    if (!baseUrl) {
        throw new Error('baseUrl is required');
    }

    const domain = baseUrl.hostname;
    const siteName = domain.split('.')[0]; 
    const adminUrl = new URL(`https://${siteName}.s4.q4web.com/admin/default.aspx`);
    
    adminUrl.searchParams.set('LanguageId', '1');
    adminUrl.searchParams.set('SectionId', '184b727d-3857-4ca6-b4fc-6436fb81ca30');
    
    await page.goto(adminUrl.toString(), {
        waitUntil: 'networkidle0'
    });
    await waitTillHTMLRendered(page);
}

async function createNew(page: puppeteer.Page): Promise<void> {
  try {
    const newButtonSelectors = [
      '#btnNew',
      'input[value="New"]',
      'a.form-button.action-button.action-button--primary'
    ];

    for (const selector of newButtonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.click(selector);
        await waitTillHTMLRendered(page);
        return;
      } catch (error) {
        continue;
      }
    }
    throw new Error('Could not find new button');
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to create new item: ${err.message}`);
  }
}

async function isCreateNewDownloadListsEmpty(page: puppeteer.Page): Promise<boolean> {
    console.log('Checking if form is empty...');
    try {
        const title = await page.evaluate(() => {
            const titleInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtReportTitle');
            console.log('Title input value:', titleInput?.value);
            return titleInput?.value || '';
        });
        const isEmpty = !title;
        console.log('Form empty status:', isEmpty);
        return isEmpty;
    } catch (error) {
        console.error('Error checking form:', error);
        return false;
    }
}

interface Settings {
  baseUrlToCreateTo: URL;
}

const settings: Settings = {
  baseUrlToCreateTo: new URL('https://q4-ext.s4.q4web.com')
};

async function create(page: puppeteer.Page, downloadList: DownloadLists): Promise<void> {
  try {
    console.log(`📝 Creating download list for: ${downloadList.title}`);
    
    await createNew(page);
    await fillForm(page, downloadList);
    
    // Save the form
    await page.click('#btnSave');
    await waitTillHTMLRendered(page);
    
    console.log('✅ Download list created successfully');
  } catch (error) {
    const err = error as Error;
    console.error('❌ Failed to create download list:', err.message);
    throw err;
  }
}

async function fillForm(page: puppeteer.Page, downloadList: DownloadLists): Promise<void> {
  try {
    // Fill in the title
    await page.evaluate((title: string) => {
      const titleInput = document.querySelector<HTMLInputElement>('#txtTitle');
      if (titleInput) {
        titleInput.value = title;
        titleInput.dispatchEvent(new Event('change'));
      }
    }, downloadList.title);

    // Fill in the description
    if (downloadList.description) {
      await page.evaluate((description: string) => {
        const descInput = document.querySelector<HTMLTextAreaElement>('#txtDescription');
        if (descInput) {
          descInput.value = description;
          descInput.dispatchEvent(new Event('change'));
        }
      }, downloadList.description);
    }

    // Set the download type
    if (downloadList.downloadType) {
      await page.evaluate((type: string) => {
        const typeSelect = document.querySelector<HTMLSelectElement>('#ddlType');
        if (typeSelect) {
          const options = Array.from(typeSelect.options);
          const option = options.find(opt => opt.text === type);
          if (option) {
            typeSelect.value = option.value;
            typeSelect.dispatchEvent(new Event('change'));
          }
        }
      }, downloadList.downloadType.toString());
    }

    // Set the date if available
    if (downloadList.date) {
      const dateString = formatDate(downloadList.date);
      await page.evaluate((date: string) => {
        const dateInput = document.querySelector<HTMLInputElement>('#txtDate');
        if (dateInput) {
          dateInput.value = date;
          dateInput.dispatchEvent(new Event('change'));
        }
      }, dateString);
    }

    // Handle document or URL
    if (downloadList.relatedDoc) {
      if (downloadList.relatedDoc.customFilename === 'online_content' && downloadList.relatedDoc.remotePath) {
        // Set online URL radio button
        await page.evaluate(() => {
          const radio = document.querySelector<HTMLInputElement>('#rbOnline');
          if (radio) {
            radio.click();
          }
        });

        // Set the URL
        await page.evaluate((url: string) => {
          const urlInput = document.querySelector<HTMLInputElement>('#txtUrl');
          if (urlInput) {
            urlInput.value = url;
            urlInput.dispatchEvent(new Event('change'));
          }
        }, downloadList.relatedDoc.remotePath.toString());
      } else if (downloadList.relatedDoc.localPath) {
        // Set file radio button
        await page.evaluate(() => {
          const radio = document.querySelector<HTMLInputElement>('#rbFile');
          if (radio) {
            radio.click();
          }
        });

        // Set the file path
        await page.evaluate((path: string) => {
          const fileInput = document.querySelector<HTMLInputElement>('#txtFile');
          if (fileInput) {
            fileInput.value = path;
            fileInput.dispatchEvent(new Event('change'));
          }
        }, downloadList.relatedDoc.localPath);
      }
    }

    await waitTillHTMLRendered(page);
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to fill form: ${err.message}`);
  }
}

function formatDate(date: any): string {
  const month = date._month.month.toString().padStart(2, '0');
  const day = date._day.day.toString().padStart(2, '0');
  const year = date._year.year;
  return `${month}/${day}/${year}`;
}

async function main() {
  let browser: puppeteer.Browser | undefined;
  
  try {
    if (!process.env.CMS_USER || !process.env.CMS_PASSWORD) {
      throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
    }

    console.log('🔄 Loading download lists...');
    const downloadLists = await loadDownloadLists();
    console.log(`📚 Found ${downloadLists.length} items to process`);

    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Add dialog handler to automatically accept alerts
    page.on('dialog', async dialog => {
      console.log('🔔 Alert detected:', dialog.message());
      await dialog.accept();
    });

    console.log('🔑 Navigating to login page...');
    await page.goto('https://q4-ext.s4.q4web.com/login');
    await ensureLogin(page);

    let processedItems: DownloadLists[] = [];
    for (const downloadList of downloadLists) {
      try {
        await create(page, downloadList);
        downloadList.state = State.Created;
        processedItems.push(downloadList);
      } catch (error) {
        const err = error as Error;
        console.error(`❌ Failed to process ${downloadList.title}:`, err.message);
        downloadList.state = State.Error;
        processedItems.push(downloadList);
      }
    }

    console.log('💾 Saving results...');
    await writeToFile({
      filename: '04-download-create.json',
      directory: path.join(__dirname, 'scraperMetadata'),
      data: JSON.stringify(processedItems, null, 2)
    });

    console.log('✨ Process complete!');
  } catch (error) {
    const err = error as Error;
    console.error('❌ An error occurred:', err.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function loadDownloadLists(): Promise<DownloadLists[]> {
  try {
    const filePath = path.join(__dirname, 'scraperMetadata', '03-download-downloads.json');
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(fileContent) as DownloadLists[];
  } catch (error) {
    const err = error as Error;
    console.error('❌ Failed to load download lists:', err.message);
    throw err;
  }
}

// Start the script
main().catch((error: Error) => {
  console.error('❌ Script failed:', error.message);
  process.exit(1);
});


