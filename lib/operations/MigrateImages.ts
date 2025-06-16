import { Base } from './Base';
import { SiteConfig } from '../core/types';
import { Page } from 'puppeteer';
import chalk from 'chalk';
import { LoginManager } from '../core/LoginManager';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getSafeSiteDirName } from '../helpers/siteName';
import readline from 'readline';

export class MigrateImages extends Base {
    private readonly sectionId = 'e75c9967-5a03-4708-98a9-c9f83b19786f';
    private readonly languageId = 1;
    private rl: readline.Interface;

    constructor(site: SiteConfig, loginManager?: LoginManager) {
        super(site, loginManager);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    private async waitForUserInput(message: string): Promise<void> {
        return new Promise(resolve => {
            console.log(chalk.yellow(`\n${message}`));
            this.rl.question('Press Enter to continue...', () => {
                resolve();
            });
        });
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private loadSourceDepartments(): { departments: Array<{ name: string; persons: any[] }> } {
        try {
            const dataDir = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'persons');
            const filePath = join(dataDir, 'persons.json');
            
            if (!existsSync(filePath)) {
                console.log(chalk.yellow(`No previously scraped data found at ${filePath}`));
                console.log(chalk.yellow('Please run the ScrapePerson operation first'));
                return { departments: [] };
            }
            
            const fileContent = readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            console.log(chalk.green(`\nLoaded ${data.departments.length} departments from source data`));
            return data;
        } catch (error) {
            console.error(chalk.red('Error loading source departments:'), error);
            return { departments: [] };
        }
    }

    private async createDepartmentFolder(page: Page, departmentName: string): Promise<boolean> {
        try {
            // Open file explorer
            await page.evaluate(() => {
                (window as any).OpenDocManager && (window as any).OpenDocManager('_ctrl0_ctl07_dialogOpener1', '', '');
            });
            await page.waitForSelector('#RadWindowWrapper__ctrl0_ctl07_dialogOpener1DocumentManager');
            await this.delay(1000);

            // Get iframe
            const frame = await page.waitForSelector('iframe[name="Window"]');
            if (!frame) throw new Error('File explorer iframe not found');
            const frameContent = await frame.contentFrame();
            if (!frameContent) throw new Error('Could not get iframe content');

            // Click images folder
            const imageSpans = await frameContent.$$('div.rtTemplate > span.folder + span');
            for (const span of imageSpans) {
                const text = await frameContent.evaluate(el => el.textContent?.trim(), span);
                if (text === 'images') {
                    await span.click();
                    await this.delay(1000);
                    break;
                }
            }

            // Create new folder
            await frameContent.waitForSelector('li.rtbItem.rtbBtn.rtbGroupIn a[title="New Folder"]');
            await frameContent.click('li.rtbItem.rtbBtn.rtbGroupIn a[title="New Folder"]');
            await this.delay(1000);

            // Type folder name
            const inputSelector = 'input.rwDialogInput.rfdDecorated';
            await frameContent.waitForSelector(inputSelector);
            await frameContent.click(inputSelector);
            await frameContent.evaluate((selector) => {
                const input = document.querySelector(selector) as HTMLInputElement;
                if (input) input.value = '';
            }, inputSelector);
            await frameContent.type(inputSelector, getSafeSiteDirName(departmentName));
            await this.delay(1000);

            // Click OK
            const okButtons = await frameContent.$$('a.rwPopupButton');
            for (const btn of okButtons) {
                const text = await frameContent.evaluate(el => el.textContent?.trim(), btn);
                if (text === 'OK') {
                    await btn.click();
                    // Wait a bit for any potential dialog
                    await this.delay(2000);
                    break;
                }
            }

            return true;
        } catch (error) {
            console.error(chalk.red(`Error creating folder for ${departmentName}:`), error);
            return false;
        }
    }

    /**
     * Verifies that the uploaded files appear in the grid
     */
    private async verifyFilesUploaded(frameContent: any, expectedFiles: string[]): Promise<boolean> {
        try {
            console.log(chalk.blue('Verifying file uploads...'));
            
            // Wait for grid to update (max 30 seconds)
            const maxWaitTime = 30000;
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
                const uploadedFiles = await frameContent.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('#RadFileExplorer1_grid_ctl00 tr.rgRow'));
                    return rows
                        .filter(row => {
                            const style = (row as HTMLElement).style;
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        })
                        .map(row => {
                            const nameDiv = row.querySelector('.rfeFileExtension');
                            const sizeCell = row.querySelector('td:nth-child(2)');
                            return {
                                name: nameDiv?.textContent?.trim() || '',
                                size: sizeCell?.textContent?.trim() || ''
                            };
                        });
                });

                // Check if all expected files are present and have sizes
                const allFilesPresent = expectedFiles.every(expectedFile => {
                    const uploadedFile = uploadedFiles.find((f: { name: string; size: string }) => f.name === expectedFile);
                    return uploadedFile && uploadedFile.size && parseInt(uploadedFile.size) > 0;
                });

                if (allFilesPresent) {
                    console.log(chalk.green('All files verified in grid:'));
                    uploadedFiles.forEach((file: { name: string; size: string }) => {
                        console.log(chalk.green(`  - ${file.name} (${file.size} bytes)`));
                    });
                    return true;
                }

                // Wait a bit before checking again
                await this.delay(1000);
            }

            console.log(chalk.red('Timeout waiting for files to appear in grid'));
            return false;
        } catch (error) {
            console.error(chalk.red('Error verifying file uploads:'), error);
            return false;
        }
    }

    private async uploadImages(page: Page, departmentName: string): Promise<boolean> {
        try {
            // Get local images for this department
            const safeDeptName = getSafeSiteDirName(departmentName);
            const sourceDir = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'images', safeDeptName);
            
            if (!existsSync(sourceDir)) {
                console.log(chalk.yellow(`No image directory found for department: ${departmentName}`));
                return false;
            }

            // Get all image files
            const files = readdirSync(sourceDir);
            const imageFiles = files.filter(file => {
                const lowerFile = file.toLowerCase();
                return lowerFile.endsWith('.jpg') || lowerFile.endsWith('.jpeg') || lowerFile.endsWith('.png');
            });

            if (imageFiles.length === 0) {
                console.log(chalk.yellow(`No images found for department: ${departmentName}`));
                return false;
            }

            console.log(chalk.green(`\nStarting upload for ${departmentName}`));
            console.log(chalk.green(`Found ${imageFiles.length} images to upload`));
            imageFiles.forEach(file => console.log(chalk.green(`  - ${file}`)));

            // Open file explorer
            await page.evaluate(() => {
                (window as any).OpenDocManager && (window as any).OpenDocManager('_ctrl0_ctl07_dialogOpener1', '', '');
            });
            await page.waitForSelector('#RadWindowWrapper__ctrl0_ctl07_dialogOpener1DocumentManager');
            await this.delay(1000);

            // Get iframe
            const frame = await page.waitForSelector('iframe[name="Window"]');
            if (!frame) throw new Error('File explorer iframe not found');
            const frameContent = await frame.contentFrame();
            if (!frameContent) throw new Error('Could not get iframe content');

            // Click images folder
            const imageSpans = await frameContent.$$('div.rtTemplate > span.folder + span');
            for (const span of imageSpans) {
                const text = await frameContent.evaluate(el => el.textContent?.trim(), span);
                if (text === 'images') {
                    await span.click();
                    await this.delay(1000);
                    break;
                }
            }

            // Click department folder
            const deptSpans = await frameContent.$$('div.rtTemplate > span.folder + span');
            for (const span of deptSpans) {
                const text = await frameContent.evaluate(el => el.textContent?.trim(), span);
                if (text === safeDeptName) {
                    await span.click();
                    await this.delay(1000);
                    break;
                }
            }

            // Click upload button in toolbar
            console.log(chalk.yellow('Clicking upload button in toolbar...'));
            await frameContent.waitForSelector('li.rtbItem.rtbBtn.rtbGroupEnd a[title="Upload"]');
            await frameContent.click('li.rtbItem.rtbBtn.rtbGroupEnd a[title="Upload"]');
            await this.delay(1000);

            // Wait for upload dialog and set overwrite option
            console.log(chalk.yellow('Setting up upload dialog...'));
            await frameContent.waitForSelector('#RadFileExplorer1_asyncUpload1');
            await frameContent.evaluate(() => {
                const checkbox = document.querySelector('#RadFileExplorer1_chkOverwrite') as HTMLInputElement;
                if (checkbox) checkbox.checked = true;
            });
            await this.delay(1000);

            // Select files using the correct input
            console.log(chalk.yellow('Selecting files for upload...'));
            const fileInput = await frameContent.waitForSelector('#RadFileExplorer1_asyncUpload1file0');
            if (!fileInput) throw new Error('File input not found');
            const filePaths = imageFiles.map(file => join(sourceDir, file));
            await fileInput.uploadFile(...filePaths);

            // Wait for upload button to be ready (no disabled attribute)
            console.log(chalk.yellow('Waiting for upload button to be ready...'));
            await frameContent.waitForFunction(() => {
                const button = document.querySelector('#RadFileExplorer1_btnUpload_input');
                return button && !button.hasAttribute('disabled');
            }, { timeout: 30000 }); // 30s timeout for safety

            // Hard wait 1s after button is ready
            console.log(chalk.yellow('Button ready, waiting 1s before clicking...'));
            await this.delay(1000);

            // Click upload button (click the parent span instead of the input)
            console.log(chalk.yellow('Clicking upload button...'));
            const uploadButtonSpan = await frameContent.waitForSelector('span#RadFileExplorer1_btnUpload');
            if (!uploadButtonSpan) throw new Error('Upload button span not found');

            let uploadDialogClosed = false;
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (attempt > 1) {
                    console.log(chalk.yellow(`Retrying upload button click (attempt ${attempt})...`));
                    await this.delay(2000); // Add 2 second delay between retries
                    await uploadButtonSpan.click();
                } else {
                    await uploadButtonSpan.click();
                }
                try {
                    await frameContent.waitForFunction(() => {
                        const el = document.getElementById('RadWindowWrapper_RadFileExplorer1_windowManagerfileExplorerUpload');
                        return el && (el.getAttribute('aria-hidden') === 'true' || el.style.display === 'none' || el.style.visibility === 'hidden');
                    }, { timeout: 2000 }); // Wait up to 2 seconds for dialog to close
                    uploadDialogClosed = true;
                    break;
                } catch (e) {
                    console.log(chalk.yellow(`Upload dialog did not close after click (attempt ${attempt}).`));
                }
            }
            if (!uploadDialogClosed) {
                console.log(chalk.red('Upload dialog did not close after maximum retries.'));
                throw new Error('Upload dialog did not close after clicking upload button multiple times.');
            }
            console.log(chalk.yellow('Upload dialog closed, verifying files...'));
            
            // Wait for files to appear in grid
            const filesVerified = await this.verifyFilesUploaded(frameContent, imageFiles);
            if (!filesVerified) {
                throw new Error('Failed to verify file uploads in grid');
            }

            console.log(chalk.green(`Successfully uploaded and verified ${imageFiles.length} images for ${departmentName}`));
            return true;
        } catch (error) {
            console.error(chalk.red(`Error uploading images for ${departmentName}:`), error);
            return false;
        }
    }

    public async execute(): Promise<boolean> {
        try {
            const departments = await this.loadSourceDepartments();
            if (!departments.departments.length) {
                console.log(chalk.yellow('No departments found to process'));
                return true;
            }

            const page = await this.getPage();
            if (!page) throw new Error('Failed to get page');

            // Set up dialog handler once for the entire operation
            page.on('dialog', async dialog => {
                try {
                    await dialog.accept();
                } catch (error) {
                    // Ignore any dialog handling errors
                }
            });

            let successCount = 0;
            let failureCount = 0;
            let skippedCount = 0;
            let hadUploadFailure = false;

            for (const department of departments.departments) {
                // Refresh page at the start of processing each department
                console.log(chalk.yellow('\nRefreshing page for new department...'));
                await page.reload({ waitUntil: 'networkidle0' });
                await this.delay(2000);

                console.log(chalk.blue(`\nProcessing department: ${department.name}`));

                // Create folder
                const folderCreated = await this.createDepartmentFolder(page, department.name);
                if (!folderCreated) {
                    console.log(chalk.red(`Failed to create folder for ${department.name}`));
                    failureCount++;
                    hadUploadFailure = true;
                    continue;
                }

                // Upload images
                const imagesUploaded = await this.uploadImages(page, department.name);
                if (imagesUploaded === false) {
                    // Check if this was due to no images found
                    const safeDeptName = getSafeSiteDirName(department.name);
                    const sourceDir = join(process.cwd(), 'data', getSafeSiteDirName(this.site.name), 'images', safeDeptName);
                    const fs = require('fs');
                    if (!fs.existsSync(sourceDir) || fs.readdirSync(sourceDir).filter((file: string) => file.match(/\.(jpg|jpeg|png)$/i)).length === 0) {
                        console.log(chalk.yellow(`No images found for department: ${department.name}`));
                        skippedCount++;
                    } else {
                        console.log(chalk.red(`Failed to upload images for department: ${department.name}`));
                        failureCount++;
                        hadUploadFailure = true;
                    }
                } else if (imagesUploaded === true) {
                    successCount++;
                }
            }

            // Summary
            console.log(chalk.blue('\nMigration Summary:'));
            if (successCount > 0) {
                console.log(chalk.green(`Successfully processed: ${successCount} departments`));
            }
            if (skippedCount > 0) {
                console.log(chalk.yellow(`No images found for: ${skippedCount} departments`));
            }
            if (failureCount > 0) {
                console.log(chalk.red(`Failed to process: ${failureCount} departments`));
            }
            if (successCount === 0 && skippedCount > 0 && failureCount === 0) {
                console.log(chalk.yellow('No images found for any department. Skipping image migration.'));
                return true;
            }
            return !hadUploadFailure;
        } catch (error) {
            console.error(chalk.red('Error during migration:'), error);
            return false;
        }
    }
} 