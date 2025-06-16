/*
  A service class responsible for scraping and creating Press Releases
*/

import CMSService, {ContentMenuName} from './CMS';
import { PressRelease } from '../data/PressRelease';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { CMSDate } from '../data/CMSDate';
import { CMSTime, Meridiem } from '../data/Time';
import { Select } from '../data/Select';
import { isAbsoluteUrl, convertStringToCMSPageUrl } from '../helpers/String';
import { CMSFile } from '../data/CMSFile';
import * as path from 'path';
import { Attachment, parseAttachmentType, parseAttachmentDocumentType } from '../data/Attachment';
import { State } from '../data/State';

const MAX_LENGTH_SEO_NAME = 230;

interface Scrapable {
  gotoToindex();
  scrapeDetails(pr: PressRelease);
  scrapeIndex();
  scrapeContentTable();
  create(pr: PressRelease);
}

type CMSTableData = {
  href: string;
  date: string;
  title: string;
}

type ScrapedAttachment = {
  title: string,
  type: string,
  docType: string,
  path: string,
}

export class CMSPressReleaseService extends CMSService implements Scrapable {

  async gotoToindex(){
    await this.gotoContentIndexPage(ContentMenuName.PressRelease);
  }

  async scrapeIndex(maxPages: number=-1): Promise<Array<PressRelease>> {
    await this.gotoToindex();
    
    let tableData: Array<PressRelease> = [];
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
  
  async scrapeContentTable(): Promise<Array<PressRelease>> {
    let scraped = await this._page.evaluate(() => {
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

    let parsed: Array<PressRelease> = scraped.map((entry) => {
      return new PressRelease({
        date: entry.date,
        title: entry.title,
        href: entry.href,
        state: State.Index
      });
    });

    return parsed;

  }

  async scrapeDetails(pr: PressRelease) {
    
    console.log('Scraping:', pr.title);
    await this._page.goto(pr.href.toString(), { 
      waitUntil: 'networkidle0' 
    });

    await waitTillHTMLRendered(this._page);

    const date = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#txtPressReleaseDate').value;
    });
    
    pr.date = new CMSDate(date);

    const time = await this._page.evaluate(() => {
      const hour = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl03_ddlHour').value;
      const minute = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl03_ddlMinute').value;
      const meridiem = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl03_ddlAMPM').value;
      return {
        hour,
        minute,
        meridiem
      }
    });
    pr.time = new CMSTime(time.hour, time.minute, time.meridiem);

    const category = await this._page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlCategoryList');
      return {
        value: select.value,
        text: select.options[select.selectedIndex].innerText,
      }
    });
    pr.category = new Select(category.value, category.text);

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
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl05_txtDocument').value
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
       
    const attachments = await this._page.evaluate(() => {
      /* Attachments */
      const attachments: Array<ScrapedAttachment> = [];
      const attachmentRows = document.querySelectorAll('div#attachmentEdit table tbody tr');
      for (const row of attachmentRows) {        
        const attachment: ScrapedAttachment = {
          title: row.querySelector<HTMLTableCellElement>('td:nth-child(1)').innerText,
          type: row.querySelector<HTMLTableCellElement>('td:nth-child(2)').innerText,
          docType: row.querySelector<HTMLTableCellElement>('td:nth-child(3)').innerText,
          path: row.querySelector<HTMLTableCellElement>('td:nth-child(4)').innerText,
        };
        attachments.push(attachment);
      }
      return attachments;
    })

    if (attachments.length > 0){
      pr.attachments = attachments.map((e) => {
        let attachmentUrl: URL;
        // If the attachment is not using an absolute path, create a URL
        // by cominig the baseFilesUrl with the relative path
        if (!isAbsoluteUrl(e.path)){
          attachmentUrl = new URL(this._baseFilesUrl.toString());
          attachmentUrl.pathname = path.join(attachmentUrl.pathname, e.path);
        } else {
          attachmentUrl = new URL(e.path);
        }
        return new Attachment(e.title, parseAttachmentType(e.type), parseAttachmentDocumentType(e.docType), new CMSFile(attachmentUrl));
      });
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
    Clicks on add a new press release from the context of a press release page
  */
  async createNew() {
    await this._page.evaluate(() => {
      document.querySelector<HTMLElement>('#_ctrl0_ctl19_btnAddNew_submitButton').click();
    });
    await this._page.waitForTimeout(2000);
    await waitTillHTMLRendered(this._page);
  }

  async isCreateNewPressReleaseEmpty(){
    const title = await this._page.evaluate(() =>{
      return document.querySelector<HTMLInputElement>('#txtHeadline').value;
    });
    const customPageUrl = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#txtSeoName').value;
    })
    return !title && !customPageUrl;
  }
  
  async create(pr: PressRelease, test: boolean=false){
    /*
      Takes in all the fields from PressReleaee and enters it into a Create Press Release form
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
    } while (await this.isCreateNewPressReleaseEmpty() === false);

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
        let o = option as HTMLOptionElement;
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
      const titleInput = document.querySelector<HTMLInputElement>('#txtHeadline');      
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
        updateText(document.querySelector('#_ctrl0_ctl19_ctl05_txtDocument'), path);
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

    // Attachments
    if (pr.attachments && pr.attachments.length > 0){
      for (const attachment of pr.attachments){
        let localPath = attachment.file.localPath.toString();
        await this._page.evaluate((title: string, path: string) => {
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#attachmentEdit > div > h2 > div.actionContainer > a')).triggerHandler('click');

          document.querySelector<HTMLInputElement>('#attachmentTitle').value = title;
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#attachmentTitle')).triggerHandler('change');

          document.querySelector<HTMLInputElement>('#attachmentDocumentTypeOnline').click();
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#attachmentDocumentTypeOnline')).triggerHandler('change');

          if (!path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('/')){
            path = '/' + path;
          }
          document.querySelector<HTMLInputElement>('#attachmentPathOnline').value = path;
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#attachmentPathOnline')).triggerHandler('change');

        }, attachment.title, localPath);

        await this._page.evaluate(() => {
          document.querySelector<HTMLAnchorElement>('#attachmentEdit > div > div.child-form-container > div.form-button-panel > a.action-button.action-button--light-bg.action-button--standard').click();
        });

      }
    }

    // Multimedia
    if (pr.multimedias && pr.multimedias.length > 0){
      for (const multimedia of pr.multimedias){
        await this._page.evaluate((title: string, path: string) => {
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#multimediaEdit > div > h2 > div.actionContainer > a')).triggerHandler('click');

          document.querySelector<HTMLLabelElement>('#multimediaEdit #multimediaDocumentTypeExternal').click();
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#multimediaEdit #multimediaDocumentTypeExternal')).triggerHandler('change');

          document.querySelector<HTMLInputElement>('#mediaTitle').value = title;
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#mediaTitle')).triggerHandler('change');
        
          if (!path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('/')){
            path = '/' + path;
          }
          document.querySelector<HTMLInputElement>('#multimediaEdit #multimediaExternal').value = path;
          // @ts-ignore: Unreachable code error
          angular.element(document.querySelector('#multimediaEdit #multimediaExternal')).triggerHandler('change');

        }, multimedia.title, multimedia.file.localPath);

        await this._page.evaluate(() => {
          document.querySelector<HTMLAnchorElement>('#multimediaEdit > div > div.child-form-container > div.form-button-panel > a.action-button.action-button--light-bg').click();
        });

      }
    }

    // URL Override
    if (pr.urlOverride){
      const override = pr.urlOverride instanceof URL ? pr.urlOverride.toString() : pr.urlOverride.localPath;
      await this._page.evaluate((urlOverride: string) => {
        updateText(document.querySelector('#_ctrl0_ctl19_txtLinkToUrl'), urlOverride);
      }, override);
    }

    // Category
    if (pr.category && pr.category.text && pr.category.text.length > 0) {
      await this._page.evaluate((category: string) => {
        updateSelect('ddlCategoryList', category);
      }, pr.category.text);
    }

    // Date
    await this._page.evaluate((date: string) => {
      const dateElement = document.querySelector<HTMLInputElement>('#txtPressReleaseDate');
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
      await this._page.click('#_ctrl0_ctl19_ctl04_btnSave');
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
