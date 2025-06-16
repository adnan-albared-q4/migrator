import { writeToFile, convertJsonToCMSClasses, convertJsonToCMSClassesDownloadLists } from '../../lib/helpers/FileSystem';
import settings from './_settings';
import { CMSRevertToLive } from '../../lib/services/CMSRevertToLive';
import { launchPuppeteer } from '../../lib/scraper/PuppeteerHelper';
import { PressRelease } from '../../lib/data/PressRelease';
import { objectifyArray } from '../../lib/data/Objectifiable';
import * as puppeteer from 'puppeteer';
import { waitTillHTMLRendered, clearBrowserCookies } from '../../lib/helpers/Puppeteer';
import { clear } from 'console';
import { DownloadLists } from '../../lib/data/DownloadLists';
import { CMSFile } from '../../lib/data/CMSFile';
import { transformFileName } from '../../lib/helpers/FileNameTransformer';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Log environment variables for debugging (without showing actual values)
console.log('Environment check:', {
  CMS_USER: process.env.CMS_USER ? '✓' : '✗',
  CMS_PASSWORD: process.env.CMS_PASSWORD ? '✓' : '✗'
});

async function ensureLogin(page: puppeteer.Page): Promise<void> {
  if (page.url().includes('/login')) {
    console.log('🔑 Logging in...');
    try {
      // Get credentials from environment
      const username = process.env.CMS_USER;
      const password = process.env.CMS_PASSWORD;
      
      if (!username || !password) {
        throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
      }

      // Wait for username field with a 30-second timeout
      await page.waitForSelector('#txtUserName', { timeout: 30000 });
      
      // Perform login by passing credentials directly
      await page.type('#txtUserName', username);
      await page.type('#txtPassword', password);
      await page.click('#btnSubmit');

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

async function scrapeItemDetails(page: puppeteer.Page, item: DownloadLists): Promise<boolean> {
  try {
    if (!item.href) {
      console.log('  ⚠️ No href found for item');
      return false;
    }

    console.log(`\n🔍 Processing: ${item.title || 'Untitled'}`);
    
    await page.goto(item.href.toString(), {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 0
    });
    console.log('  ✅ Page loaded');
    
    await waitTillHTMLRendered(page);
    await page.waitForTimeout(2000);

    // Check which type of download it is
    const { type, url } = await page.evaluate(() => {
      // Array of possible file input selectors
      const fileInputSelectors = [
          'input#_ctrl0_ctl19_ctl01_TxtDocument',
          'input#_ctrl0_ctl19_ctl01_txtDocument',
          'input#_ctrl0_ctl19_ctl01_Document'  // Adding another possible variation
      ];

      // Array of possible URL input selectors
      const urlInputSelectors = [
          'input#_ctrl0_ctl19_txtDownloadUrl',
          'input#_ctrl0_ctl19_DownloadUrl'     // Adding another possible variation
      ];
      
      // Check all possible file input selectors
      let fileInputValue = '';
      for (const selector of fileInputSelectors) {
          const input = document.querySelector<HTMLInputElement>(selector);
          if (input && input.value) {
              fileInputValue = input.value;
              console.log(`Found file input with selector: ${selector}`);
              break;
          }
      }

      // Check all possible URL input selectors
      let urlInputValue = '';
      for (const selector of urlInputSelectors) {
          const input = document.querySelector<HTMLInputElement>(selector);
          if (input && input.value) {
              urlInputValue = input.value;
              console.log(`Found URL input with selector: ${selector}`);
              break;
          }
      }
      
      // If URL input has value, it's online type
      if (urlInputValue) {
          return { type: 'online' as const, url: urlInputValue };
      } 
      // Otherwise, treat as file type (default)
      else {
          return { type: 'file' as const, url: fileInputValue };
      }
    });

    console.log(`  📌 Found type: ${type}`);
    console.log(`  🔍 Found URL: ${url || 'none'}`);

    // Get description
    const description = await page.evaluate(() => {    
      const element = document.querySelector<HTMLTextAreaElement>('textarea#_ctrl0_ctl19_txtReportDescription');
      return element ? element.value : '';
    });
    
    if (description) {
      item.description = description;
      console.log('  📝 Found description');
    }

    if (type === 'online' && url) {
      console.log('  🌐 Processing as online download');
      
      // Handle relative or absolute URLs
      const absoluteUrl = url.startsWith('http') 
        ? url 
        : new URL(url, settings.baseUrlToCreateTo).toString();
      
      // Use CMSFile with special markers
      item.relatedDoc = new CMSFile(
        new URL(absoluteUrl),            // Store absolute URL in remotePath
        'online_content',       // Marker in customFilename
        '-1'                    // Special marker in localPath
      );
      console.log(`  ✅ Got online URL: ${absoluteUrl}`);
      return true;
    }
    
    if (type === 'file' && url) {
      console.log('  📁 Processing as file download');
      const absoluteDocUrl = new URL(url, settings.baseUrlToScrapeFrom).toString();
      const originalFilename = url.split('/').pop();
      
      if (!originalFilename) {
        console.log('  ⚠️ Could not extract filename from URL');
        return false;
      }

      // Transform filename using the utility function
      const transformedFilename = transformFileName(originalFilename);

      console.log(`  📝 Original filename: ${originalFilename}`);
      console.log(`  📝 Transformed filename: ${transformedFilename}`);

      const downloadType = (item.downloadType ? String(item.downloadType) : 'general')
        .toLowerCase()
        .replace(/\s+/g, '-');
      
      const localPath = `files/doc_downloads/${downloadType}/${transformedFilename}`;
      
      item.relatedDoc = new CMSFile(
        new URL(absoluteDocUrl),
        transformedFilename,
        localPath
      );
      console.log(`  ✅ Got file: ${transformedFilename}`);
      return true;
    }

    console.log('  ⚠️ No valid download type found');
    return false;
    
  } catch (error) {
    const err = error as Error;
    console.log(`⚠️ Error processing ${item.title || 'Untitled'}:`);
    console.log('   ' + err.message);
    return false;
  }
}

async function main() {
  const startTime = Date.now();
  console.log('🌟 Starting scraper...');
  
  const data = convertJsonToCMSClassesDownloadLists(
    path.join(__dirname, 'scraperMetadata', '01-download-index.json')
  );
  console.log(`📚 Found ${data.length} items to process`);

  // Check if all items are online before launching browser
  const onlineItems = data.filter(item => 
    item.relatedDoc?.customFilename === 'online_content'
  );

  if (onlineItems.length === data.length) {
    console.log('\n🌐 All items are online content, no downloads needed');
    console.log('💾 Writing results to file...');
    
    writeToFile({
      filename: '02-download-details.json',
      directory: path.join(__dirname, 'scraperMetadata'),
      data: JSON.stringify(data, null, 4)
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ Process complete! Total time: ${totalTime}s`);
    process.exit(0);
    return;
  }

  // If we get here, there are files to process
  const fileItems = data.length - onlineItems.length;
  console.log(`\n📊 Item breakdown:`);
  console.log(`    Online items: ${onlineItems.length}`);
  console.log(`    File items: ${fileItems}`);
  
  // Launch single browser instance
  const { browser } = await launchPuppeteer({
    headless: false,
    width: 1600,
    height: 900
  });

  try {
    const page = await browser.newPage();
    console.log('\n🚀 Starting to process items...\n');
    
    // Initial login - find first item with href
    const firstItem = data.find(item => item.href);
    if (!firstItem?.href) {
      throw new Error('No valid items with href found');
    }
    
    await page.goto(firstItem.href.toString());
    await ensureLogin(page);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Process items one at a time
    for (const item of data) {
      if (item.href) {
        const success = await scrapeItemDetails(page, item);
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
        console.log(`✅ Progress: ${successCount + errorCount + skipCount}/${data.length} items completed`);
        console.log(`   Success: ${successCount}, Errors: ${errorCount}, Skipped: ${skipCount}`);
        await page.waitForTimeout(2000);
      } else {
        skipCount++;
        console.log(`⚠️ Skipping item "${item.title || 'unknown'}" - no href found`);
      }
    }

    console.log('\n💾 Writing results to file...');
    writeToFile({
      filename: '02-download-details.json',
      directory: path.join(__dirname, 'scraperMetadata'),
      data: JSON.stringify(data, null, 4)
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ Process complete! Total time: ${totalTime}s`);
    console.log(`📊 Final Statistics:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Skipped: ${skipCount}`);
    console.log(`   Total: ${data.length}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
});