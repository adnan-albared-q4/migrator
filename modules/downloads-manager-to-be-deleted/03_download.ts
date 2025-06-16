import settings from './_settings';
import { writeToFile, convertJsonToCMSClassesDownloadLists } from '../../lib/helpers/FileSystem';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import * as readline from 'readline';
import * as mkdirp from 'mkdirp';
import * as dotenv from 'dotenv';
import { DownloadLists } from '../../lib/data/DownloadLists';

// Load environment variables
dotenv.config();

// Helper function for waiting
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function promptThreadCount(): Promise<number> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Enter number of concurrent downloads (1-5) [default: 3]: ', (answer) => {
            rl.close();
            const threads = answer ? Math.min(Math.max(parseInt(answer), 1), 5) : 3;
            console.log(`Starting with ${threads} concurrent downloads...`);
            resolve(threads);
        });
    });
}

async function ensureLogin(page: puppeteer.Page, threadId: number): Promise<void> {
    if (!page.url().includes('/login')) return;

    console.log(`[Thread ${threadId}] 🔑 Logging in...`);
    
    await page.waitForSelector('#txtUserName', { timeout: 0 });
    await page.evaluate(() => {
        (document.querySelector<HTMLInputElement>("#txtUserName")!).value = process.env.CMS_USER || '';
        (document.querySelector<HTMLInputElement>("#txtPassword")!).value = process.env.CMS_PASSWORD || '';
        (document.querySelector<HTMLButtonElement>("#btnSubmit")!).click();
    });

    await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
        waitTillHTMLRendered(page)
    ]);
    
    await wait(2000);
}

async function downloadFile(page: puppeteer.Page, item: DownloadLists, threadId: number): Promise<boolean> {
    try {
        if (!item.relatedDoc || item.relatedDoc.customFilename === 'online_content') {
            console.log(`[Thread ${threadId}] ⏩ Skipping online content: ${item.title}`);
            return true;
        }

        const fileUrl = item.relatedDoc.remotePath.toString();
        const downloadPath = item.relatedDoc.localPath;
        const fileName = path.basename(downloadPath);
        const downloadDir = path.dirname(downloadPath);

        console.log(`[Thread ${threadId}] 📥 Downloading: ${item.title}`);
        console.log(`[Thread ${threadId}] 🔗 URL: ${fileUrl}`);

        // Ensure download directory exists
        mkdirp.sync(downloadDir);

        // Set download path for this file
        await (page as any)._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: path.resolve(downloadDir)
        });

        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 0 });
        
        if (page.url().includes('/login')) {
            await ensureLogin(page, threadId);
            await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 0 });
        }

        // Wait for download to complete
        await wait(5000);

        // Verify file exists
        if (fs.existsSync(downloadPath)) {
            console.log(`[Thread ${threadId}] ✅ Downloaded: ${fileName}`);
            return true;
        } else {
            console.error(`[Thread ${threadId}] ❌ Failed to download: ${fileName}`);
            return false;
        }
    } catch (error) {
        const err = error as Error;
        if (err.message && !err.message.includes('net::ERR_ABORTED')) {
            console.error(`[Thread ${threadId}] ❌ Error downloading file:`, err.message);
            return false;
        }
        return true;
    }
}

async function processThread(items: DownloadLists[], startIndex: number, step: number, threadId: number): Promise<DownloadLists[]> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    const page = await browser.newPage();
    
    try {
        for (let i = startIndex; i < items.length; i += step) {
            const item = items[i];
            await downloadFile(page, item, threadId);
            await wait(2000);
        }
    } finally {
        await browser.close();
    }
    
    return items;
}

async function loadDownloadData(): Promise<DownloadLists[]> {
    const filePath = path.join(__dirname, 'scraperMetadata', '02-download-details.json');
    if (!fs.existsSync(filePath)) {
        throw new Error('02-download-details.json not found. Please run the scraping script first.');
    }
    return convertJsonToCMSClassesDownloadLists(filePath);
}

export async function downloadFiles(): Promise<void> {
    console.log('🎯 Starting file downloader...');

    // Load and validate download data
    const items = await loadDownloadData();
    console.log(`\n📊 Total items found: ${items.length}`);

    // Count items with and without files
    const itemsWithFiles = items.filter(item => 
        item.relatedDoc && 
        item.relatedDoc.customFilename !== 'online_content'
    );
    const onlineItems = items.filter(item => 
        item.relatedDoc && 
        item.relatedDoc.customFilename === 'online_content'
    );
    const itemsWithoutFiles = items.filter(item => !item.relatedDoc);

    // Print breakdown
    console.log('\n📊 Download Status Breakdown:');
    console.log(`    Total items: ${items.length}`);
    console.log(`    With files to download: ${itemsWithFiles.length}`);
    console.log(`    Online content (no download): ${onlineItems.length}`);
    console.log(`    Without files: ${itemsWithoutFiles.length}`);

    if (itemsWithFiles.length === 0) {
        console.log('\n⚠️ No files to download');
        return;
    }

    // Start concurrent downloads
    const threadCount = await promptThreadCount();
    console.log(`\n🚀 Starting download process with ${threadCount} threads...\n`);

    // Start multiple threads
    const threads = Array.from({ length: threadCount }, (_, i) => 
        processThread(itemsWithFiles, i, threadCount, i + 1)
    );

    // Wait for all threads to complete
    const results = await Promise.all(threads);

    // Flatten results and combine with online items and items without files
    const allItems = [
        ...results.flat(),
        ...onlineItems,
        ...itemsWithoutFiles
    ];

    // Save updated data
    writeToFile({
        filename: '03-download-complete.json',
        directory: path.join(__dirname, 'scraperMetadata'),
        data: JSON.stringify(allItems, null, 2)
    });

    console.log('\n📊 Download Summary:');
    console.log(`Total items with files: ${itemsWithFiles.length}`);
    console.log(`Successfully downloaded: ${itemsWithFiles.filter(item => 
        fs.existsSync(item.relatedDoc?.localPath || '')).length}`);
    console.log(`Failed: ${itemsWithFiles.length - itemsWithFiles.filter(item => 
        fs.existsSync(item.relatedDoc?.localPath || '')).length}`);
    console.log(`\n📂 Files saved to: ${path.resolve('files/doc_downloads')}`);

    console.log('\n✨ Process complete!');
}

// Run directly if called from command line
if (require.main === module) {
    downloadFiles().catch(console.error);
}