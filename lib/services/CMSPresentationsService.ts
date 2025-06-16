/*
A service class responsible for scraping and creating Press Releases
*/

import CMSService, {ContentMenuName} from './CMS';
import { Presentations } from '../data/Presentations';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { CMSDate } from '../data/CMSDate';
import { CMSTime, Meridiem } from '../data/Time';
import { isAbsoluteUrl, convertStringToCMSPageUrl } from '../helpers/String';
import { CMSFile } from '../data/CMSFile';
import * as path from 'path';
import { State } from '../data/State';

const MAX_LENGTH_SEO_NAME = 230;

interface Scrapable {
gotoToindex();
scrapeDetails(pr: Presentations);
scrapeIndex();
scrapeContentTable();
create(pr: Presentations);
}

type CMSTableData = {
href: string;
date: string;
title: string;
}

export class CMSPresentationsService extends CMSService implements Scrapable {

    async gotoToindex(){
        await this.gotoContentIndexPage(ContentMenuName.Presentations);
    }

    async scrapeIndex(maxPages: number=-1): Promise<Array<Presentations>> {
        await this.gotoToindex();
        
        let tableData: Array<Presentations> = [];
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
    
    async scrapeContentTable(): Promise<Array<Presentations>> {
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

        const parsed: Array<Presentations> = scraped.map((entry) => {
        return new Presentations({
            date: entry.date,
            title: entry.title,
            href: entry.href,
            state: State.Index
        });
        });

        return parsed;

    }

    async scrapeDetails(pr: Presentations) {
        
        console.log('Scraping:', pr.title);
        await this._page.goto(pr.href.toString(), { 
        waitUntil: 'networkidle0' 
        });

        await waitTillHTMLRendered(this._page);

        const date = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#txtPresentationDate').value;
        });
        
        pr.date = new CMSDate(date);

        const time = await this._page.evaluate(() => {
        const hour = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl00_ddlHour').value;
        const minute = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl00_ddlMinute').value;
        const meridiem = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl00_ddlAMPM').value;
        return {
            hour,
            minute,
            meridiem
        }
        });
        pr.time = new CMSTime(time.hour, time.minute, time.meridiem);

        const body = await this._page.evaluate(() => {
        // TODO Figure out a way to tell TypeScript that this exists
        // @ts-ignore: Unreachable code error
        const body = window.$find('_ctrl0_ctl19_RADeditor1').get_html(); //Telerik UI command
        return body;
        });
        pr.body = body;

        const tags = await this._page.evaluate(() => {
        const tagsAsString = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_TagSelection_txtTags').value.trim();
        return tagsAsString ? tagsAsString.split(' ') : [''];
        });
        pr.tags = tags;

        const relatedUrl = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl02_txtDocument').value
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
        pr.relatedDoc = new CMSFile(url);
        }     

        /*
        URL Override could be a downloadable file
        */
        const urlOverride = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtLinkToUrl').value;
        });

        /*
        If the urlOverride is an absolute path, keep as is as it might be an external site
        but if it's a relative path than save it as a CMSFile so that in later steps,
        the scraper will download the materials.
        */

        if (urlOverride !== ''){
        if (!isAbsoluteUrl(urlOverride)){
            const remotePath = new URL(this._baseFilesUrl.toString());
            remotePath.pathname = path.join(remotePath.pathname, urlOverride);
            pr.urlOverride = new CMSFile(remotePath);
        } else {      
            pr.urlOverride = new URL(urlOverride);
        }
        }    

    const audioFile = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl03_txtDocument').value
        });
        
        if (audioFile !== ''){
        let url: URL;
        if (!isAbsoluteUrl(audioFile)){
            let baseUrl: string;
            try {
            baseUrl = this._baseFilesUrl.toString();
            } catch (e) {
            throw new Error(`Please provide a bucket to download files from the Q4 server. Add a baseFilesUrl to your settings.js file.`);
            }
            url = new URL(baseUrl);
            url.pathname = path.join(url.pathname, audioFile);
        }
        else {
            url = new URL(audioFile);
        }
        pr.audioFile = new CMSFile(url);
        }
            
    const videoFile = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl04_txtDocument').value
        });
        
        if (videoFile !== ''){
        let url: URL;
        if (!isAbsoluteUrl(videoFile)){
            let baseUrl: string;
            try {
            baseUrl = this._baseFilesUrl.toString();
            } catch (e) {
            throw new Error(`Please provide a bucket to download files from the Q4 server. Add a baseFilesUrl to your settings.js file.`);
            }
            url = new URL(baseUrl);
            url.pathname = path.join(url.pathname, videoFile);
        }
        else {
            url = new URL(videoFile);
        }
        pr.videoFile = new CMSFile(url);
        }
        
    const relatedFile = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl05_txtDocument').value
        });
        
        if (relatedFile !== ''){
        let url: URL;
        if (!isAbsoluteUrl(relatedFile)){
            let baseUrl: string;
            try {
            baseUrl = this._baseFilesUrl.toString();
            } catch (e) {
            throw new Error(`Please provide a bucket to download files from the Q4 server. Add a baseFilesUrl to your settings.js file.`);
            }
            url = new URL(baseUrl);
            url.pathname = path.join(url.pathname, relatedFile);
        }
        else {
            url = new URL(relatedFile);
        }
        pr.relatedFile = new CMSFile(url);
        }  
        
        /*
        Visibility Options
        */
        pr.openLinkInNewWindow = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkOpenLinkInNewWindow').checked
        });
        pr.exclude = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkExclude').checked
        });
        pr.active = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkActive').checked
        });

        pr.state = State.Details;

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

    async isCreateNewPresentationsEmpty(){
        const title = await this._page.evaluate(() =>{
            return document.querySelector<HTMLInputElement>('#txtTitle').value;
        });
        const customPageUrl = await this._page.evaluate(() => {
            return document.querySelector<HTMLInputElement>('#txtSeoName').value;
        })
        return !title && !customPageUrl;
    }
    
    async create(pr: Presentations, test: boolean=false){
        /*
        Takes in all the fields from Presentations and enters it into a Create Presentation form
        */

        console.log('Creating:', pr.title);

        // Ignore this press release if active is false or if it's already been created
        if (pr.active === false || pr.state === State.Created){
        console.log(`Ignoring ${pr.title} as active is set to ${pr.active}`);
        return;
        }

        /*
        If the page does not have empty fields, continue to press the Create
        New button until it does. This is because the system might take a long
        time to load a Create New PR page.
        */
        do {
        await this.createNew();
        } while (await this.isCreateNewPresentationsEmpty() === false);

        await waitTillHTMLRendered(this._page);

        /*
        TODO: Find out why external functions can be loaded as a script tag without
        causing errors. Fix is to recreate the function closer to the context.
        */
        function updateText(input: HTMLInputElement, value: string){
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
    
        // Title
        await this._page.evaluate((title: string) => {
        const titleInput = document.querySelector<HTMLInputElement>('#txtTitle');      
        updateText(titleInput, title);      
        }, pr.title);


        // Tags
        if (pr.tags && pr.tags.length > 0){
        await this._page.evaluate((tags: Array<string>) => {
            updateText(document.querySelector('#_ctrl0_ctl19_TagSelection_txtTags'), tags.join(' '));
        }, pr.tags);
        }

        // Related Document
        if (pr.relatedDoc && pr.relatedDoc.localPath){
        await this._page.evaluate((path: string) => {
            updateText(document.querySelector('#_ctrl0_ctl19_ctl02_txtDocument'), path);
        }, pr.relatedDoc.localPath);
        }

        if(pr.body && pr.body.length > 0){
        await this._page.evaluate((body: string) => {
        // TODO Figure out a way to tell TypeScript that this exists
        // @ts-ignore: Unreachable code error
            const $find = window.$find;
            const prEditor = $find('_ctrl0_ctl19_RADeditor1');
            if (prEditor && body) {
            prEditor.set_html(body);
            }
        }, pr.body);
        }

        // URL Override
        if (pr.urlOverride){
            const override = pr.urlOverride instanceof URL ? pr.urlOverride.toString() : pr.urlOverride.localPath;
            await this._page.evaluate((urlOverride: string) => {
                updateText(document.querySelector('#_ctrl0_ctl19_txtLinkToUrl'), urlOverride);
            }, override);
        }

        // Date
        await this._page.evaluate((date: string) => {
        const dateElement = document.querySelector<HTMLInputElement>('#txtPresentationDate');
        updateText(dateElement, date);
        }, pr.date.to_string());

        // Time
        const time = pr.time == null ? new CMSTime('12', '00', Meridiem.AM) : pr.time;
        await this._page.evaluate((time) => {
        updateSelect('ddlHour', time.hour);
        updateSelect('ddlMinute', time.minute);
        updateSelect('ddlAMPM', time.meridiem );
        }, time.objectify());

        // Arbitrary wait.
        await this._page.waitForTimeout(2000);
        
        // Create SEO Friendly Name
        const [month, day, year] = pr.date.to_string().split('/');
        let seoName = convertStringToCMSPageUrl(pr.title);
        if (seoName.length >= MAX_LENGTH_SEO_NAME){
        seoName = seoName.slice(0, 230);
        }
        seoName = `${seoName}-${month}-${day}-${year}`;

        // Update SEO text
        await this._page.evaluate((seoName: string) => {
        const url = document.querySelector<HTMLInputElement>('#txtSeoName');
        updateText(url, seoName);
        }, seoName);

        await this._page.waitForTimeout(2000); 

        if (test){
        return false;
        }

        try {
        await this._page.click('#_ctrl0_ctl19_ctl01_btnSave');
        await this._page.waitForSelector('#_ctrl0_ctl19_ucMessages_validationsummary');
        const newHref = await this._page.evaluate(() => {
            const message = document.querySelector('#_ctrl0_ctl19_ucMessages_UserMessage');
            if (!message.classList.contains('message-success')) {
            throw new Error(message.querySelector<HTMLElement>('.message-content').innerText);
            }
            return window.location.href;
        });
        pr.createdHref = new URL(newHref);
        pr.state = State.Created;
        return true;
        } catch(e){
        console.error("Error with: ", pr.title);
        return false;
        }

    }
}