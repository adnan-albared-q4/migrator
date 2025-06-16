import { Base } from './Base';
import { Page } from 'puppeteer';
import { SiteConfig } from '../core/types';
import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { LinkUpdate, SavedLinkUpdates } from './LinkUpdateTypes';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';

interface PRItem {
    title: string;
    editLink: string;
}

export class UpdatePressReleaseLinks extends Base {
    private readonly SECTION_ID = 'de305d4f-2c81-4acf-975a-b859e43248c8';
    private readonly selectors = {
        table: 'table.grid-list',
        rows: 'table.grid-list tr:not(.DataGridHeader):not(.DataGridPager)',
        editLinks: 'a.grid-list-action-edit',
        editorIframe: '#_ctrl0_ctl19_RADeditor1_contentIframe',
        editorBody: 'body.RadEContentBordered',
        htmlModeButton: 'a.reMode_html',
        designModeButton: 'a.reMode_design',
        paginationLinks: 'td[colspan="6"] a',
        currentPage: 'td[colspan="6"] span',
        saveButton: 'a.form-button.action-button.action-button--primary[title*="Shortcut: Alt + S"]',
        textarea: 'textarea.reTextArea'
    };

    private items: PRItem[] = [];
    private processedPages: Set<number> = new Set();
    private linkUpdates: LinkUpdate[] = [];
    private readonly savedUpdatesPath: string;

    constructor(site: SiteConfig) {
        super(site);
        this.savedUpdatesPath = join(process.cwd(), 'data', 'link-updates');
        if (!existsSync(this.savedUpdatesPath)) {
            mkdirSync(this.savedUpdatesPath, { recursive: true });
        }
    }

    async execute(): Promise<boolean> {
        try {
            // Get logged in page
            const page = await this.getPage();
            if (!page) {
                throw new Error('Failed to get logged in page');
            }
            
            // Get link updates from user
            await this.collectLinkUpdates();
            
            // Navigate to PR list
            await this.navigateToPRList(page);
            
            // Get all items from all pages
            console.log('Getting items from all pages...');
            await this.getAllPRItems(page);
            
            console.log(`Total PR items found: ${this.items.length}`);

            // Process all items
            for (const item of this.items) {
                console.log(`\nProcessing item: ${item.title}`);
                console.log(`Edit link: ${item.editLink}`);
                
                // Process the item
                const hasContent = await this.processItem(page, item);
                
                if (hasContent) {
                    console.log('Changes made to this item.');
                } else {
                    console.log('No content or changes in this item, moving to next...');
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error in UpdatePressReleaseLinks:', error);
            return false;
        }
    }

    private async collectLinkUpdates(): Promise<void> {
        console.log('\nPlease provide link updates (press Enter with no input to finish):');
        
        // First, check for saved updates
        const savedUpdates = this.getSavedUpdates();
        if (savedUpdates.length > 0) {
            console.log('\nSaved link update sets:');
            savedUpdates.forEach((update, index) => {
                console.log(`${index + 1}. ${update.name} (${update.updates.length} updates, created ${update.createdAt})`);
            });
            
            const useSaved = await this.promptUser('\nWould you like to use a saved set? (y/N): ');
            if (useSaved.toLowerCase() === 'y') {
                const selection = await this.promptUser('Enter the number of the set to use: ');
                const index = parseInt(selection) - 1;
                if (index >= 0 && index < savedUpdates.length) {
                    this.linkUpdates = savedUpdates[index].updates;
                    console.log(`\nUsing saved set: ${savedUpdates[index].name}`);
                    return;
                }
            }
        }
        
        // Collect new updates
        while (true) {
            const oldFilename = await this.promptUser('Enter old filename to find (e.g., example.pdf) or press Enter to finish: ');
            if (!oldFilename) break;
            
            const newPath = await this.promptUser('Enter new full path/link to replace with (e.g., /media/new-example.pdf or https://example.com/new-example.pdf): ');
            if (!newPath) {
                console.log('New path/link is required. Skipping this update.');
                continue;
            }
            
            const selector = await this.promptUser('Enter optional CSS selector to target specific elements (or press Enter to skip): ');
            
            this.linkUpdates.push({
                oldPath: oldFilename,
                newPath: newPath,
                selector: selector || undefined
            });
            
            console.log('Link update added.');
        }
        
        if (this.linkUpdates.length > 0) {
            console.log(`\nCollected ${this.linkUpdates.length} link updates:`);
            this.linkUpdates.forEach((update, index) => {
                console.log(`${index + 1}. Find: ${update.oldPath} -> Replace with: ${update.newPath}${update.selector ? ` (selector: ${update.selector})` : ''}`);
            });
            
            // Ask if user wants to save this set
            const saveSet = await this.promptUser('\nWould you like to save this set of updates? (y/N): ');
            if (saveSet.toLowerCase() === 'y') {
                const setName = await this.promptUser('Enter a name for this set: ');
                this.saveUpdates(setName);
            }
        } else {
            console.log('\nNo link updates provided.');
        }
    }

    private getSavedUpdates(): SavedLinkUpdates[] {
        try {
            const files = readFileSync(join(this.savedUpdatesPath, 'index.json'), 'utf8');
            return JSON.parse(files);
        } catch (error) {
            return [];
        }
    }

    private saveUpdates(name: string): void {
        const savedUpdates = this.getSavedUpdates();
        const newUpdate: SavedLinkUpdates = {
            name,
            updates: this.linkUpdates,
            createdAt: new Date().toISOString()
        };
        
        savedUpdates.push(newUpdate);
        writeFileSync(join(this.savedUpdatesPath, 'index.json'), JSON.stringify(savedUpdates, null, 2));
        console.log(`\nSaved update set "${name}" successfully.`);
    }

    private async processItem(page: Page, item: PRItem): Promise<boolean> {
        try {
            // Navigate to edit page - editLink is already a complete URL
            console.log(`Navigating to edit page: ${item.editLink}`);
            await page.goto(item.editLink, { waitUntil: 'networkidle0' });
            
            // Wait for editor iframe
            console.log('Waiting for editor iframe...');
            await page.waitForSelector(this.selectors.editorIframe);
            
            // Switch to HTML mode
            console.log('Switching to HTML mode...');
            await page.click(this.selectors.htmlModeButton);
            await page.waitForTimeout(1000); // Wait for mode switch
            
            // Get editor content
            const frame = await page.$(this.selectors.editorIframe);
            if (!frame) {
                throw new Error('Editor iframe not found');
            }
            
            const frameContent = await frame.contentFrame();
            if (!frameContent) {
                throw new Error('Could not get frame content');
            }
            
            // Get current content
            const content = await frameContent.$eval(this.selectors.editorBody, el => el.innerHTML);
            console.log('Current content length:', content.length);
            
            if (content.length === 0) {
                console.log('No content found in this item.');
                return false;
            }
            
            // Update links in content
            const { updatedContent, changesMade } = this.updateLinksInContent(content);
            
            if (changesMade) {
                console.log('Changes detected, updating content...');
                
                // Update the content in the editor using the FAQ approach
                await page.waitForSelector(this.selectors.textarea);
                await page.evaluate((content) => {
                    const textarea = document.querySelector('textarea.reTextArea') as HTMLTextAreaElement;
                    if (textarea) {
                        textarea.value = content;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, updatedContent);
                
                // Switch back to Design mode
                console.log('Switching to Design mode...');
                await page.click(this.selectors.designModeButton);
                await page.waitForTimeout(1000); // Wait for mode switch
                
                // Save changes
                console.log('Saving changes...');
                await page.click(this.selectors.saveButton);
                await page.waitForNavigation({ waitUntil: 'networkidle0' });
                
                // Verify changes were saved
                console.log('\nVerifying changes were saved...');
                await page.goto(item.editLink, { waitUntil: 'networkidle0' });
                await page.waitForSelector(this.selectors.editorIframe);
                await page.click(this.selectors.htmlModeButton);
                await page.waitForTimeout(1000);
                
                const verifyFrame = await page.$(this.selectors.editorIframe);
                if (!verifyFrame) {
                    throw new Error('Editor iframe not found during verification');
                }
                
                const verifyFrameContent = await verifyFrame.contentFrame();
                if (!verifyFrameContent) {
                    throw new Error('Could not get frame content during verification');
                }
                
                const savedContent = await verifyFrameContent.$eval(this.selectors.editorBody, el => el.innerHTML);
                
                // Check if our changes are in the saved content
                const changesVerified = this.linkUpdates.every(update => {
                    const normalizedOldPath = update.oldPath.replace(/[-@]/g, '[-@]');
                    const oldPattern = new RegExp(normalizedOldPath, 'g');
                    const newPattern = new RegExp(update.newPath, 'g');
                    
                    const oldMatches = [...savedContent.matchAll(oldPattern)];
                    const newMatches = [...savedContent.matchAll(newPattern)];
                    
                    console.log(`\nVerifying ${update.oldPath}:`);
                    console.log(`  Old pattern matches: ${oldMatches.length}`);
                    console.log(`  New pattern matches: ${newMatches.length}`);
                    
                    return oldMatches.length === 0 && newMatches.length > 0;
                });
                
                if (changesVerified) {
                    console.log('\n✅ All changes were successfully saved and verified!');
                } else {
                    console.log('\n❌ Warning: Changes may not have been saved correctly!');
                }
                
                console.log('Item processed successfully');
                return true;
            } else {
                console.log('No changes needed for this item.');
                return false;
            }
            
        } catch (error) {
            console.error('Error processing item:', error);
            throw error;
        }
    }

    private updateLinksInContent(content: string): { updatedContent: string; changesMade: boolean } {
        let updatedContent = content;
        let changesMade = false;
        let totalReplacements = 0;
        
        // Log initial content for debugging
        console.log('\nInitial content preview:', content.substring(0, 200) + '...');
        
        for (const update of this.linkUpdates) {
            if (update.selector) {
                // TODO: Implement selector-based updates
                console.log(`Selector-based updates not implemented yet for: ${update.selector}`);
            } else {
                console.log(`\nLooking for: ${update.oldPath}`);
                
                // Create a pattern that handles both - and @ variations
                const normalizedOldPath = update.oldPath.replace(/[-@]/g, '[-@]');
                console.log(`Normalized pattern: ${normalizedOldPath}`);
                
                // Create regex patterns to match:
                // 1. href=".../filename.ext" or href="filename.ext"
                // 2. src=".../filename.ext" or src="filename.ext"
                const patterns = [
                    // href=".../filename.ext" or href="filename.ext"
                    new RegExp(`(href=["'])([^"']*[/\\\\])?${normalizedOldPath}(["'])`, 'g'),
                    // src=".../filename.ext" or src="filename.ext"
                    new RegExp(`(src=["'])([^"']*[/\\\\])?${normalizedOldPath}(["'])`, 'g')
                ];

                for (const pattern of patterns) {
                    const oldContent = updatedContent;
                    let replacements = 0;
                    
                    // Find all matches first to log them
                    const matches = [...oldContent.matchAll(pattern)];
                    if (matches.length > 0) {
                        console.log(`Found ${matches.length} matches in ${pattern.toString()}:`);
                        matches.forEach((match, index) => {
                            console.log(`  ${index + 1}. ${match[0]}`);
                        });
                    }
                    
                    updatedContent = updatedContent.replace(pattern, (match, attr, path, quote) => {
                        replacements++;
                        return `${attr}${update.newPath}${quote}`;
                    });
                    
                    if (replacements > 0) {
                        changesMade = true;
                        totalReplacements += replacements;
                        console.log(`Updated ${replacements} instances of ${update.oldPath} to ${update.newPath}`);
                    }
                }
            }
        }
        
        if (changesMade) {
            console.log(`\nTotal replacements made: ${totalReplacements}`);
            // Log final content preview
            console.log('\nFinal content preview:', updatedContent.substring(0, 200) + '...');
        }
        
        return { updatedContent, changesMade };
    }

    private async waitForUserConfirmation(message: string): Promise<void> {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise(resolve => {
            rl.question(message, () => {
                rl.close();
                resolve();
            });
        });
    }

    private async promptUser(message: string): Promise<string> {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise(resolve => {
            rl.question(message, (answer) => {
                rl.close();
                resolve(answer.trim());
            });
        });
    }

    private async navigateToPRList(page: Page): Promise<void> {
        const baseUrl = `https://${this.site.destination}.s4.q4web.com`;
        const url = `${baseUrl}/admin/default.aspx?LanguageId=1&SectionId=${this.SECTION_ID}`;
        console.log(`Navigating to PR list...`);
        
        await page.goto(url, { waitUntil: 'networkidle0' });
        
        // Wait for the table to be visible
        await page.waitForSelector(this.selectors.table, { visible: true });
    }

    private async getPRItems(page: Page): Promise<PRItem[]> {
        const items: PRItem[] = [];
        
        // Get all rows
        const rows = await page.$$(this.selectors.rows);
        
        // Process each row
        for (const row of rows) {
            // Get title (first column)
            const titleElement = await row.$('td:first-child');
            const title = titleElement ? await page.evaluate(el => el.textContent?.trim() || '', titleElement) : 'No Title';
            
            // Get edit link
            const editLinkElement = await row.$(this.selectors.editLinks);
            const editLink = editLinkElement ? await page.evaluate(el => el.getAttribute('href') || '', editLinkElement) : '';
            
            if (editLink) {
                console.log(`Found edit link for "${title}": ${editLink}`); // Debug log
                items.push({ title, editLink });
            }
        }
        
        return items;
    }

    private async getAllPRItems(page: Page): Promise<void> {
        let hasNextPage = true;

        while (hasNextPage) {
            // Get current page number
            const currentPageSpan = await page.$(this.selectors.currentPage);
            if (!currentPageSpan) {
                hasNextPage = false;
                continue;
            }

            const currentPageText = await page.evaluate(el => el.textContent?.trim() || '', currentPageSpan);
            const currentPageNum = parseInt(currentPageText);
            
            // Process current page if not already processed
            if (!this.processedPages.has(currentPageNum)) {
                console.log(`Processing page ${currentPageNum}...`);
                const pageItems = await this.getPRItems(page);
                this.items.push(...pageItems);
                this.processedPages.add(currentPageNum);
            }

            // Get all pagination links
            const paginationLinks = await page.$$(this.selectors.paginationLinks);
            
            // Get all visible page numbers
            const visiblePages = new Set<number>();
            for (const link of paginationLinks) {
                const linkText = await page.evaluate(el => el.textContent?.trim() || '', link);
                if (linkText !== '...') {
                    const pageNum = parseInt(linkText);
                    if (!isNaN(pageNum)) {
                        visiblePages.add(pageNum);
                    }
                }
            }

            // Check if we've processed all visible pages
            const allVisiblePagesProcessed = Array.from(visiblePages).every(pageNum => 
                this.processedPages.has(pageNum)
            );

            // Find next page to process
            let nextPageLink = null;
            
            if (allVisiblePagesProcessed) {
                // If all visible pages are processed, look for "..." link
                const lastLink = paginationLinks[paginationLinks.length - 1];
                const lastLinkText = await page.evaluate(el => el.textContent?.trim() || '', lastLink);
                
                if (lastLinkText === '...') {
                    nextPageLink = lastLink;
                } else {
                    hasNextPage = false;
                }
            } else {
                // Find the next unprocessed page
                for (const link of paginationLinks) {
                    const linkText = await page.evaluate(el => el.textContent?.trim() || '', link);
                    if (linkText !== '...') {
                        const pageNum = parseInt(linkText);
                        if (!this.processedPages.has(pageNum)) {
                            nextPageLink = link;
                            break;
                        }
                    }
                }
            }

            if (!nextPageLink) {
                hasNextPage = false;
                continue;
            }

            // Click next page
            await nextPageLink.click();
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
        }
    }
} 