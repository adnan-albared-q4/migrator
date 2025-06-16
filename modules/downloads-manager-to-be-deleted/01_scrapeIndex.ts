import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { writeToFile } from '../../lib/helpers/FileSystem';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import * as path from 'path';
import * as dotenv from 'dotenv';
import settings from './_settings';
import downloads_settings from './downloads_settings';

// Load environment variables
dotenv.config();

interface ScrapedItem {
  title: string;
  downloadType: string;
  date: string;
  href: string;
}

async function main() {
  const startTime = Date.now();
  console.log('🌟 Starting scraper...');

  const username = process.env.CMS_USER;
  const password = process.env.CMS_PASSWORD;

  if (!username || !password) {
    throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
  }

  try {
    const { page } = await launchPuppeteer({ 
      headless: false,
      width: 1600,
      height: 900
    });

    // Navigate to login page
    console.log('🔑 Navigating to login page...');
    await page.goto(settings.baseUrlToScrapeFrom.toString());
    await waitTillHTMLRendered(page);

    // Login
    console.log('🔐 Logging in...');
    await page.waitForSelector('#txtUserName');
    await page.type('#txtUserName', username);
    await page.type('#txtPassword', password);
    await page.click('#btnSubmit');

    // Wait for navigation and page load
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      waitTillHTMLRendered(page)
    ]);
    await page.waitForTimeout(2000);

    // Navigate to download list page
    console.log('📂 Looking for Download List link...');
    await page.waitForSelector('.level3', { timeout: 60000 });
    await page.waitForTimeout(1000);

    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".level3 > li > a"));
      const navLink = links.find(link => link.textContent?.trim() === 'Download List');
      
      if (navLink) {
        navLink.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      throw new Error('Could not find Download List navigation link');
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
      waitTillHTMLRendered(page)
    ]);

    await page.waitForTimeout(2000);

    // Select the download type from dropdown
    console.log(`📋 Selecting download type: ${downloads_settings.downloadType}...`);
    await page.waitForSelector('#_ctrl0_ctl19_ddlReportType');
    
    // Select the correct option from the dropdown
    await page.evaluate((downloadType) => {
      const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlReportType');
      if (select) {
        const options = Array.from(select.options);
        const targetOption = options.find(opt => opt.textContent?.trim() === downloadType);
        if (targetOption) {
          select.value = targetOption.value;
          // Trigger the change event
          select.dispatchEvent(new Event('change'));
        }
      }
    }, downloads_settings.downloadType);

    // Wait for the page to update after dropdown selection
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
      waitTillHTMLRendered(page)
    ]);
    await page.waitForTimeout(2000);

    let allScrapedItems: ScrapedItem[] = [];
    let hasNextPage = true;
    let pageNum = 1;
    let totalInactiveSkipped = 0;
    let totalNonLiveSkipped = 0;

    while (hasNextPage) {
      await waitTillHTMLRendered(page);
      console.log(`📄 Scraping page ${pageNum}...`);

      const currentPageItems = await page.evaluate((downloadType: string): { items: ScrapedItem[], inactiveSkipped: number, nonLiveSkipped: number } => {
        // Exclude the header row by skipping tr that has DataGridHeader cells
        const items = Array.from(document.querySelectorAll('table tbody tr')).filter(row => 
          !row.querySelector('.DataGridHeader') && !row.classList.contains('DataGridPager')
        );
        let inactiveSkipped = 0;
        let nonLiveSkipped = 0;
        
        const validItems = items.map(item => {
          try {
            // Check if item is inactive
            const titleCell = item.querySelector('td:nth-child(3)') as HTMLTableCellElement;
            if (titleCell?.classList.contains('badge-content--inactive')) {
              inactiveSkipped++;
              return null;
            }

            // Check if status is Live
            const statusElement = item.querySelector('td:nth-child(5) span');
            const statusText = statusElement?.textContent?.trim() || '';
            if (!statusText.startsWith('Live')) {
              nonLiveSkipped++;
              return null;
            }

            return {
              title: titleCell?.innerText.trim() || '',
              downloadType,
              date: (item.querySelector('td:nth-child(2)') as HTMLTableCellElement).innerText.trim(),
              href: (item.querySelector('td:nth-child(1) a') as HTMLAnchorElement).href,
            };
          } catch (error) {
            console.log('Error processing row:', (error as Error).message);
            return null;
          }
        }).filter((item): item is ScrapedItem => item !== null);

        return { items: validItems, inactiveSkipped, nonLiveSkipped };
      }, downloads_settings.downloadType);

      allScrapedItems = [...allScrapedItems, ...currentPageItems.items];
      totalInactiveSkipped += currentPageItems.inactiveSkipped;
      totalNonLiveSkipped += currentPageItems.nonLiveSkipped;
      console.log(`✅ Found ${currentPageItems.items.length} items on page ${pageNum}`);
      console.log(`   Skipped: ${currentPageItems.inactiveSkipped} inactive, ${currentPageItems.nonLiveSkipped} non-live`);

      // Check for next page
      hasNextPage = await page.evaluate(() => {
        const pagerSpan = document.querySelector(".DataGridPager > td > span");
        if (!pagerSpan) return false;
        
        const next = pagerSpan.nextElementSibling as HTMLAnchorElement | null;
        if (!next) return false;

        next.click();
        return true;
      });

      if (hasNextPage) {
        pageNum++;
        await Promise.all([
          page.waitForTimeout(1000),
          page.waitForNetworkIdle({ idleTime: 500 }),
          waitTillHTMLRendered(page)
        ]);
      }
    }

    console.log(`\n📊 Results summary:`);
    console.log(`    Total pages scraped: ${pageNum}`);
    console.log(`    Total items found: ${allScrapedItems.length}`);
    console.log(`    Total items skipped:`);
    console.log(`      - Inactive: ${totalInactiveSkipped}`);
    console.log(`      - Non-live: ${totalNonLiveSkipped}`);

    console.log('\n💾 Writing results to file...');
    writeToFile({
      filename: '01-download-index.json',
      directory: path.join(__dirname, 'scraperMetadata'),
      data: JSON.stringify(allScrapedItems, null, 4)
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ Process complete! Total time: ${totalTime}s`);
    
    await page.close();
    process.exit(0);

  } catch (error) {
    const err = error as Error;
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main().catch(error => {
  const err = error as Error;
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});