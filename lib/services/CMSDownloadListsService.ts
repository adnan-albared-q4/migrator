/* eslint-disable @typescript-eslint/no-inferrable-types */
/*
A service class responsible for scraping and creating Press Releases
*/

import CMSService, {ContentMenuName} from './CMS';
import { DownloadLists } from '../data/DownloadLists';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { CMSDate } from '../data/CMSDate';
import { Select } from '../data/Select';
import { isAbsoluteUrl, convertStringToCMSPageUrl } from '../helpers/String';
import { CMSFile } from '../data/CMSFile';
import * as path from 'path';
import { State } from '../data/State';

const MAX_LENGTH_SEO_NAME = 230;

interface Scrapable {
gotoToindex();
scrapeDetails(dl: DownloadLists);
scrapeIndex();
scrapeContentTable();
create(dl: DownloadLists);
}

type CMSTableData = {
href: string;
date: string;
title: string;
}

export class CMSDownloadListsService extends CMSService implements Scrapable {

    async gotoToindex(){
        await this.gotoContentIndexPage(ContentMenuName.DownloadList);
    }

    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    async scrapeIndex(maxPages: number=-1): Promise<Array<DownloadLists>> {
        await this.gotoToindex();
        
        let tableData: Array<DownloadLists> = [];
        let scrapeTable = true;
        let currentPage = 0;
        while (scrapeTable && (maxPages === -1 || currentPage < maxPages)) {
        await waitTillHTMLRendered(this._page);

        const current = await this.scrapeContentTable();

        tableData = tableData.concat(current);
        scrapeTable = await this.gotoNextIndexPage();
        ++currentPage;
        }
        return tableData;
    }
    
    async scrapeContentTable(): Promise<Array<DownloadLists>> {
        const scraped = await this._page.evaluate(() => {
        const tableData: Array<CMSTableData> = [];
        const rows = document.querySelectorAll('.grid-list tbody tr:not(:first-child):not(:last-child)');
        for (const row of rows){
            const href = row.querySelector<HTMLAnchorElement>('td:nth-child(1) > a').href;
            const date = row.querySelector<HTMLTableCellElement>('td:nth-child(2)').textContent;
            const title = row.querySelector<HTMLTableCellElement>('td:nth-child(3)').textContent;
            tableData.push({ href, date, title });
        }
        return tableData;
        });

        const parsed: Array<DownloadLists> = scraped.map((entry) => {
        return new DownloadLists({
            date: entry.date,
            title: entry.title,
            href: entry.href,
            state: State.Index
        });
        });

        return parsed;

    }

    async scrapeDetails(dl: DownloadLists) {
        
        console.log('Scraping:', dl.title);
        await this._page.goto(dl.href.toString(), { 
        waitUntil: 'networkidle0' 
        });

        await waitTillHTMLRendered(this._page);

        const date = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#txtReportDate').value;
        });
        
        dl.date = new CMSDate(date);

        const category = await this._page.evaluate(() => {
            const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlReportType');
            return {
                value: select.value,
                text: select.options[select.selectedIndex].innerText,
            }
        });
        dl.category = new Select(category.value, category.text);

        const description = await this._page.evaluate(() => {
        return document.querySelector<HTMLTextAreaElement>('#_ctrl0_ctl19_txtReportDescription').value;
        });
        dl.description = description;

        const tags = await this._page.evaluate(() => {
        const tagsAsString = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_TagSelection_txtTags').value.trim();
        return tagsAsString ? tagsAsString.split(' ') : [''];
        });
        dl.tags = tags;

        const relatedUrl = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl01_txtDocument').value
        });
        
        if (relatedUrl !== ''){
        let url: URL;
        if (!isAbsoluteUrl(relatedUrl)){
            let baseUrl: string;
            try {
            baseUrl = this._baseFilesUrl.toString();
            } catch (e) {
            throw new Error(`Please provide a bucket to download files from the Q4 server. Add a baseFilesUrl to your settings.js file.`);
            }
            url = new URL(baseUrl);
            url.pathname = path.join(url.pathname, relatedUrl);
        }
        else {
            url = new URL(relatedUrl);
        }
        dl.relatedDoc = new CMSFile(url);
        }     

        /*
        Visibility Options
        */
        dl.active = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkActive').checked
        });

        dl.state = State.Details;

    }

    /*
        Clicks on add a new presentation from the context of a presentation page
    */
    async createNew() {
        await this._page.evaluate(() => {
        document.querySelector<HTMLElement>('#_ctrl0_ctl19_btnAddNew_submitButton').click();
        });
        await this._page.waitForTimeout(2000);
        await waitTillHTMLRendered(this._page);
    }

    async isCreateNewDownloadListsEmpty(){
        const title = await this._page.evaluate(() =>{
            return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtReportTitle').value;
        });
        return !title;
    }
    
    async create(dl: DownloadLists, test: boolean=false){
        console.log('Creating:', dl.title);

        if (dl.active === false || dl.state === State.Created) {
            console.log(`Ignoring ${dl.title} as active is set to ${dl.active}`);
            return;
        }

        do {
            await this.createNew();
        } while (await this.isCreateNewDownloadListsEmpty() === false);

        await waitTillHTMLRendered(this._page);

        function updateText(input: HTMLInputElement, value: string) {
            input.focus();
            input.value = value;
            input.blur();
        }

        function updateSelect(name: string, value: string | number) {
            value = typeof value === 'number' ? value.toString() : value; 
            const select = document.querySelector<HTMLSelectElement>(`select.control-dropdown[name*="${name}"]`);
            const options = select.children;
            
            for (const option of options) {
                const o = option as HTMLOptionElement;
                if (o.innerText === value) {
                    select.value = o.value;
                    select.dispatchEvent(new Event('change'));
                    break;
                }
            }
        }

        await this._page.addScriptTag({ content: `${updateText} ${updateSelect}` });

        // Download List Type
        if (dl.downloadType) {
            await this._page.evaluate((downloadType: string) => {
                updateSelect('_ctrl0$ctl19$ddlReportType', downloadType);
            }, dl.downloadType.toString());
        }

        // Title
        await this._page.evaluate((title: string) => {
            const titleInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtReportTitle');      
            updateText(titleInput, title);      
        }, dl.title);

        // Related Document
        if (dl.relatedDoc) {
            if (dl.relatedDoc?.customFilename === 'online_content' && dl.relatedDoc?.remotePath) {
                console.log('Found online URL entry:', dl.title);
                
                // Try to set online radio if it exists
                try {
                    await this._page.evaluate(() => {
                        const radioSelectors = [
                            '#_ctrl0_ctl19_rbDownloadUrl',                // New CMS format
                            '#_ctrl0_ctl19_ctl01_FileTypeOnline',         // Old CMS format
                            'input[value="rbDownloadUrl"]',               // Generic selector
                            'input[onclick*="Online"]'                    // Fallback selector
                        ];

                        for (const selector of radioSelectors) {
                            const radioBtn = document.querySelector<HTMLInputElement>(selector);
                            if (radioBtn) {
                                radioBtn.click();
                                console.log(`Online radio selected using: ${selector}`);
                                break;
                            }
                        }
                    });
                } catch (e) {
                    console.log('Online radio button not found, continuing with URL input only...');
                }

                // Set the URL using any available selector
                try {
                    await this._page.evaluate((url: string) => {
                        const possibleSelectors = [
                            '#_ctrl0_ctl19_txtDownloadUrl',              // New CMS format
                            '#_ctrl0_ctl19_ctl01_TxtDocument',           // Old format
                            '#_ctrl0_ctl19_ctl01_txtDocument',           // Alternative old format
                            '#_ctrl0_ctl19_ctl01_Document',              // Another variation
                            'input[name="_ctrl0$ctl19$txtDownloadUrl"]'  // Name-based selector
                        ];

                        for (const selector of possibleSelectors) {
                            const input = document.querySelector<HTMLInputElement>(selector);
                            if (input) {
                                input.value = url;
                                input.dispatchEvent(new Event('change'));
                                console.log(`URL set using selector: ${selector}`);
                                return; // Exit if we successfully set the URL
                            }
                        }
                        console.log('No matching URL input field found');
                    }, dl.relatedDoc.remotePath.toString());
                } catch (e) {
                    console.log('Unable to set URL, continuing with creation...');
                }

            } else if (dl.relatedDoc.localPath) {
                // Try to set file radio if it exists
                try {
                    await this._page.evaluate(() => {
                        const radioSelectors = [
                            '#_ctrl0_ctl19_rbDownloadPath',              // New CMS format
                            '#_ctrl0_ctl19_ctl01_FileTypeFile',          // Old CMS format
                            'input[value="rbDownloadPath"]',             // Generic selector
                            'input[onclick*="File"]'                     // Fallback selector
                        ];

                        for (const selector of radioSelectors) {
                            const radioBtn = document.querySelector<HTMLInputElement>(selector);
                            if (radioBtn) {
                                radioBtn.click();
                                console.log(`File radio selected using: ${selector}`);
                                break;
                            }
                        }
                    });
                } catch (e) {
                    console.log('File radio button not found, continuing with file path input only...');
                }

                // Set the file path using any available selector
                try {
                    await this._page.evaluate((path: string) => {
                        const possibleSelectors = [
                            '#_ctrl0_ctl19_ctl01_TxtDocument',
                            '#_ctrl0_ctl19_ctl01_txtDocument',
                            '#_ctrl0_ctl19_ctl01_Document'
                        ];

                        for (const selector of possibleSelectors) {
                            const input = document.querySelector<HTMLInputElement>(selector);
                            if (input) {
                                input.value = path;
                                input.dispatchEvent(new Event('change'));
                                console.log(`File path set using selector: ${selector}`);
                                return; // Exit if we successfully set the path
                            }
                        }
                        console.log('No matching file input field found');
                    }, dl.relatedDoc.localPath);
                } catch (e) {
                    console.log('Unable to set file path, continuing with creation...');
                }
            }
        }

        // Date
        if (dl.date) {
            console.log('Setting date...');
            await this._page.evaluate((date: string) => {
                const dateElement = document.querySelector<HTMLInputElement>('#txtReportDate');
                if (dateElement) {
                    updateText(dateElement, date);
                }
            }, dl.date.to_string());

            // Create SEO Friendly Name with date
            const [month, day, year] = dl.date.to_string().split('/');
            let seoName = convertStringToCMSPageUrl(dl.title);
            if (seoName.length >= MAX_LENGTH_SEO_NAME) {
                seoName = seoName.slice(0, 230);
            }
            seoName = `${seoName}-${month}-${day}-${year}`;
        } else {
            // Create SEO Friendly Name without date
            let seoName = convertStringToCMSPageUrl(dl.title);
            if (seoName.length >= MAX_LENGTH_SEO_NAME) {
                seoName = seoName.slice(0, 230);
            }
            console.log('No date set for:', dl.title);
        }

        await this._page.waitForTimeout(2000);

        if (test) {
            return false;
        }

        try {
        await this._page.click('#_ctrl0_ctl19_ctl00_btnSave');
        await this._page.waitForSelector('#_ctrl0_ctl19_ucMessages_validationsummary');
        const newHref = await this._page.evaluate(() => {
            const message = document.querySelector('#_ctrl0_ctl19_ucMessages_UserMessage');
            if (!message.classList.contains('message-success')) {
                throw new Error(message.querySelector<HTMLElement>('.message-content').innerText);
            }
            return window.location.href;
        });
        dl.createdHref = new URL(newHref);
        dl.state = State.Created;
        return true;
        } catch(e){
        console.error("Error with: ", dl.title, "error is: ", e);
        return false;
        }

    }
}