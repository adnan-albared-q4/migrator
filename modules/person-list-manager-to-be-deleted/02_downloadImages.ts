import settings from './_settings';
import { writeToFile } from '../../lib/helpers/FileSystem';
import { State } from '../../lib/data/State';
import { waitTillHTMLRendered } from '../../lib/helpers/Puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import * as readline from 'readline';
import * as mkdirp from 'mkdirp';
import { PersonData } from './_settings';
import { transformFileName } from '../../lib/helpers/FileNameTransformer';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface PersonWithImage extends PersonData {
    image: {
        remotePath: string;
        localPath?: string;
        uploadPath: string;
    };
}

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
    
    const username = process.env.CMS_USER;
    const password = process.env.CMS_PASSWORD;

    if (!username || !password) {
        throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
    }

    await page.waitForSelector('#txtUserName', { timeout: 0 });
    await page.evaluate((username: string, password: string) => {
        (document.querySelector<HTMLInputElement>("#txtUserName")!).value = username;
        (document.querySelector<HTMLInputElement>("#txtPassword")!).value = password;
        (document.querySelector<HTMLButtonElement>("#btnSubmit")!).click();
    }, username, password);

    await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 }),
        waitTillHTMLRendered(page)
    ]);
    
    await page.waitForTimeout(2000);
}

async function downloadImage(page: puppeteer.Page, person: PersonWithImage, downloadDir: string, threadId: number): Promise<boolean> {
    try {
        const imageUrl = person.image.remotePath;
        const fileName = transformFileName(path.basename(person.image.uploadPath));
        const downloadPath = path.join(downloadDir, fileName);

        console.log(`[Thread ${threadId}] Downloading image for ${person.firstName} ${person.lastName}...`);

        await page.goto(imageUrl, { waitUntil: 'networkidle0', timeout: 0 });
        
        if (page.url().includes('/login')) {
            await ensureLogin(page, threadId);
            await page.goto(imageUrl, { waitUntil: 'networkidle0', timeout: 0 });
        }

        // Wait for image to load
        await page.waitForTimeout(3000);

        // Get the image element
        const img = await page.$('img');
        if (!img) {
            console.error(`[Thread ${threadId}] ❌ No image found on page for ${person.firstName} ${person.lastName}`);
            return false;
        }

        // Take a screenshot of just the image element and save it
        await img.screenshot({
            path: downloadPath,
            type: 'jpeg',
            quality: 100
        });

        // Update person data with local path
        person.image.localPath = downloadPath;
        
        console.log(`[Thread ${threadId}] ✅ Downloaded: ${fileName}`);
        return true;
    } catch (error: unknown) {
        if (error instanceof Error && !error.message.includes('net::ERR_ABORTED')) {
            console.error(`[Thread ${threadId}] ❌ Error downloading image:`, error.message);
            return false;
        }
        return true;
    }
}

async function processThread(persons: PersonWithImage[], startIndex: number, step: number, threadId: number): Promise<PersonWithImage[]> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    const page = await browser.newPage();
    
    try {
        for (let i = startIndex; i < persons.length; i += step) {
            const person = persons[i];
            const deptDir = path.join('files', 'images', 
                person.department.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
            
            // Ensure department directory exists
            mkdirp.sync(deptDir);

            // Set download path for this department
            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: path.resolve(deptDir)
            });

            await downloadImage(page, person, deptDir, threadId);
            await page.waitForTimeout(2000);
        }
    } finally {
        await browser.close();
    }
    
    return persons;
}

async function loadPersonData(): Promise<PersonData[]> {
    const filePath = path.join(__dirname, 'persons.json');
    if (!fs.existsSync(filePath)) {
        throw new Error('persons.json not found. Please run the scraping script first.');
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).persons;
}

export async function downloadImages(subdomain: string): Promise<void> {
    console.log('🎯 Starting image downloader...');

    // Load and validate person data
    const persons = await loadPersonData();
    console.log(`\n📊 Total persons found: ${persons.length}`);

    // Count persons with and without images
    const personsWithoutImages = persons.filter(p => !p.image?.remotePath);
    const personsWithImages = persons.filter((p): p is PersonWithImage => 
        !!p.image && 
        typeof p.image.remotePath === 'string' &&
        typeof p.image.uploadPath === 'string'
    );

    // Print breakdown
    console.log('\n📊 Image Status Breakdown:');
    console.log(`    Total persons: ${persons.length}`);
    console.log(`    With images: ${personsWithImages.length}`);
    console.log(`    Without images: ${personsWithoutImages.length}`);

    if (personsWithImages.length === 0) {
        console.log('\n⚠️ No images to download');
        return;
    }

    // Start concurrent downloads
    const threadCount = await promptThreadCount();
    console.log(`\n🚀 Starting download process with ${threadCount} threads...\n`);

    // Start multiple threads
    const threads = Array.from({ length: threadCount }, (_, i) => 
        processThread(personsWithImages, i, threadCount, i + 1)
    );

    // Wait for all threads to complete
    await Promise.all(threads);

    // Save updated person data with local paths
    fs.writeFileSync(
        path.join(__dirname, 'persons.json'),
        JSON.stringify({ persons }, null, 2)
    );

    console.log('\n📊 Download Summary:');
    console.log(`Total persons with images: ${personsWithImages.length}`);
    console.log(`Successfully downloaded: ${personsWithImages.filter(p => p.image.localPath).length}`);
    console.log(`Failed: ${personsWithImages.length - personsWithImages.filter(p => p.image.localPath).length}`);
    console.log(`\n📂 Files saved to: ${path.resolve('files/images')}`);

    console.log('\n✨ Process complete!');
}

// Run directly if called from command line
if (require.main === module) {
    const subdomain = process.argv[2];
    if (!subdomain) {
        console.error('Usage: ts-node script.ts <subdomain>');
        process.exit(1);
    }
    downloadImages(subdomain).catch(console.error);
} 