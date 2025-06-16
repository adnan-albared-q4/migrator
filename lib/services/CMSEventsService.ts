/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-inferrable-types */
/*
  A service class responsible for scraping and creating Press Releases
*/

import CMSService, {ContentMenuName} from './CMS';
import { Events } from '../data/Events';
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
  scrapeDetails(ev: Events);
  scrapeIndex();
  scrapeContentTable();
  create(ev: Events);
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

type ScrapedSpeaker = {
  name: string,
  title: string,
}

export class CMSEventsService extends CMSService implements Scrapable {

  async gotoToindex(){
    await this.gotoContentIndexPage(ContentMenuName.Events);
  }

  async scrapeIndex(maxPages: number=-1): Promise<Array<Events>> {
    await this.gotoToindex();
    
    let tableData: Array<Events> = [];
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
  
  async scrapeContentTable(): Promise<Array<Events>> {
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

    const parsed: Array<Events> = scraped.map((entry) => {
      return new Events({
        startDate: entry.date,
        title: entry.title,
        href: entry.href,
        state: State.Index
      });
    });

    return parsed;

  }

  async scrapeDetails(ev: Events) {
    
    console.log('Scraping:', ev.title);
    await this._page.goto(ev.href.toString(), { 
      waitUntil: 'networkidle0' 
    });

    await waitTillHTMLRendered(this._page);

    const startDate = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#txtEventStartDate').value;
    });    
    ev.startDate = new CMSDate(startDate);

    const endDate = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtEventEndDate').value;
    });    
    ev.endDate = new CMSDate(endDate);

    const startTime = await this._page.evaluate(() => {
      const hour = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl00_ddlHour').value;
      const minute = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl00_ddlMinute').value;
      const meridiem = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl00_ddlAMPM').value;
      return {
        hour,
        minute,
        meridiem
      }
    });
    ev.startTime = new CMSTime(startTime.hour, startTime.minute, startTime.meridiem);

    const endTime = await this._page.evaluate(() => {
      const hour = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl01_ddlHour').value;
      const minute = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl01_ddlMinute').value;
      const meridiem = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_ctl01_ddlAMPM').value;
      return {
        hour,
        minute,
        meridiem
      }
    });    
    ev.endTime = new CMSTime(endTime.hour, endTime.minute, endTime.meridiem);

    const timeZone = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtTimeZoneDisplayName').value;
    });
    ev.timeZone = timeZone;

    const tags = await this._page.evaluate(() => {
      const tagsAsString = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_TagSelection_txtTags').value.trim();
      return tagsAsString ? tagsAsString.split(' ') : [''];
    });
    ev.tags = tags;

    const location = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtLocation').value;
    });
    ev.location = location;

    const body = await this._page.evaluate(() => {
      // TODO Figure out a way to tell TypeScript that this exists
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: Unreachable code error
      const body = window.$find('_ctrl0_ctl19_RADeditor1').get_html(); //Telerik UI command
      return body;
    });
    ev.body = body;

    /*
      Visibility Options
    */
      ev.isWebcast = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkIsWebcast').checked
      });

      ev.openLinkInNewWindow = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkOpenLinkInNewWindow').checked
      });
      ev.exclude = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkExclude').checked
      });
      ev.active = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkActive').checked
      });

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
          ev.urlOverride = new CMSFile(remotePath);
        } else {      
          ev.urlOverride = new URL(urlOverride);
        }
      }

      const relatedRelease = await this._page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlRelatedPressRelease');
        return {
          value: select.value,
          text: select.options[select.selectedIndex]?.innerText,
        }
      });
      ev.relatedRelease = new Select(relatedRelease.value, relatedRelease.text);

      const relatedFinancial = await this._page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlRelatedFinancialReport');
        return {
          value: select.value,
          text: select.options[select.selectedIndex]?.innerText,
        }
      });
      ev.relatedFinancial = new Select(relatedFinancial.value, relatedFinancial.text);

      const financialPeriodQuarter = await this._page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlRelatedReportQuarter');
        return {
          value: select.value,
          text: select.options[select.selectedIndex]?.innerText,
        }
      });
      ev.financialPeriodQuarter = new Select(financialPeriodQuarter.value, financialPeriodQuarter.text);

      const financialPeriodYear = await this._page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlRelatedReportYear');
        return {
          value: select.value,
          text: select.options[select.selectedIndex]?.innerText,
        }
      });
      ev.financialPeriodYear = new Select(financialPeriodYear.value, financialPeriodYear.text);

      const relatedPresentation = await this._page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_lstRelatedPresentation');
        return {
          value: select.value,
          text: select.options[select.selectedIndex]?.innerText,
        }
      });
      ev.relatedPresentation = new Select(relatedPresentation.value, relatedPresentation.text);

      
      const relatedWebcast = await this._page.evaluate(() => {
        return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtRelatedWebcast').value;
      });

      if (relatedWebcast !== ''){
        if (!isAbsoluteUrl(relatedWebcast)){
          const remotePath = new URL(this._baseFilesUrl.toString());
          remotePath.pathname = path.join(remotePath.pathname, relatedWebcast);
          ev.relatedWebcast = new CMSFile(remotePath);
        } else {      
          ev.relatedWebcast = new URL(relatedWebcast);
        }
      }
      const speakers = await this._page.evaluate(() => {
        /* Speakers */
        const speakers: Array<ScrapedSpeaker> = [];
        const speakerRows = document.querySelectorAll('div[ng-app="SpeakerEditApp"] table tbody tr');
        for (const row of speakerRows) {        
          const speaker: ScrapedSpeaker = {
            name: row.querySelector<HTMLTableCellElement>('td:nth-child(1)').innerText,
            title: row.querySelector<HTMLTableCellElement>('td:nth-child(2)').innerText
          };
          speakers.push(speaker);
        }
        return speakers;
      });

      if (speakers.length > 0){
        ev.speakers = speakers.map((e) => {
          const speaker = {
            name: '',
            title: ''
          };
          speaker.name = e.name;
          speaker.title = e.title;
          return speaker;
          
        });
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
      ev.attachments = attachments.map((e) => {
        let attachmentUrl: URL;
        // If the attachment is not using an absolute path, create a URL
        // by combining the baseFilesUrl with the relative path
        if (!isAbsoluteUrl(e.path)){
          attachmentUrl = new URL(this._baseFilesUrl.toString());
          attachmentUrl.pathname = path.join(attachmentUrl.pathname, e.path);
        } else {
          attachmentUrl = new URL(e.path);
        }
        return new Attachment(e.title, parseAttachmentType(e.type), parseAttachmentDocumentType(e.docType), new CMSFile(attachmentUrl));
      });
    }

    ev.state = State.Details;
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

  async isCreateNewEventsEmpty(){
    const title = await this._page.evaluate(() =>{
      return document.querySelector<HTMLInputElement>('#txtTitle').value;
    });
    const customPageUrl = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#txtSeoName').value;
    })
    return !title && !customPageUrl;
  }
  
  async create(ev: Events, test: boolean=false){
    /*
      Takes in all the fields from Events and enters it into a Create Event form
    */

    console.log('Creating:', ev.title);

    // Ignore this Event if active is false or if it's already been created
    if (ev.active === false || ev.state === State.Created){
      console.log(`Ignoring ${ev.title} as active is set to ${ev.active}`);
      return;
    }

    /*
      If the page does not have empty fields, continue to press the Create
      New button until it does. This is because the system might take a long
      time to load a Create New PR page.
    */
    do {
      await this.createNew();
    } while (await this.isCreateNewEventsEmpty() === false);

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
    /* Does the same as the above function but applies to list-box style select instead of dropdown */ 
    function updateListbox(name: string, value: string | number){
      value = typeof value === 'number' ? value.toString() : value;    
      const select = document.querySelector<HTMLSelectElement>(`select.control-listbox[name*="${name}"]`);
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

    await this._page.addScriptTag({ content: `${updateText} ${updateSelect} ${updateListbox}` });
  
    // Title
    await this._page.evaluate((title: string) => {
      const titleInput = document.querySelector<HTMLInputElement>('#txtTitle');      
      updateText(titleInput, title);      
    }, ev.title);

    // Start Date
    await this._page.evaluate((startDate: string) => {
      const dateElement = document.querySelector<HTMLInputElement>('#txtEventStartDate');
      updateText(dateElement, startDate);
    }, ev.startDate.to_string());

    // End Date
    await this._page.evaluate((endDate: string) => {
      const dateElement = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtEventEndDate');
      updateText(dateElement, endDate);
    }, ev.endDate.to_string());

    // Start Time
    const startTime = ev.startTime == null ? new CMSTime('12', '00', Meridiem.AM) : ev.startTime;
    await this._page.evaluate((startTime) => {
      updateSelect('ddlHour', startTime.hour);
      updateSelect('ddlMinute', startTime.minute);
      updateSelect('ddlAMPM', startTime.meridiem );
    }, startTime.objectify());

    // End Time
    const endTime = ev.endTime == null ? new CMSTime('12', '00', Meridiem.AM) : ev.endTime;
    await this._page.evaluate((endTime) => {
      updateSelect('_ctrl0$ctl19$ctl01$ddlHour', endTime.hour);
      updateSelect('_ctrl0$ctl19$ctl01$ddlMinute', endTime.minute);
      updateSelect('_ctrl0$ctl19$ctl01$ddlAMPM', endTime.meridiem );
    }, endTime.objectify());

    // Time Zone
    await this._page.evaluate((timeZone: string) => {
      const timeZoneInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtTimeZoneDisplayName');      
      updateText(timeZoneInput, timeZone);      
    }, ev.timeZone);

    // Tags
    if (ev.tags && ev.tags.length > 0){
      await this._page.evaluate((tags: Array<string>) => {
        updateText(document.querySelector('#_ctrl0_ctl19_TagSelection_txtTags'), tags.join(' '));
      }, ev.tags);
    }

    // Location
    await this._page.evaluate((location: string) => {
      const locationInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtLocation');      
      updateText(locationInput, location);      
    }, ev.location);

    if(ev.body && ev.body.length > 0){
      await this._page.evaluate((body: string) => {
      // TODO Figure out a way to tell TypeScript that this exists
      // @ts-ignore: Unreachable code error
        const $find = window.$find;
        const prEditor = $find('_ctrl0_ctl19_RADeditor1');
        if (prEditor && body) {
          prEditor.set_html(body);
        }
      }, ev.body);
    }
    // URL Override
    if (ev.urlOverride){
      const override = ev.urlOverride instanceof URL ? ev.urlOverride.toString() : ev.urlOverride.localPath;
      await this._page.evaluate((urlOverride: string) => {
        updateText(document.querySelector('#_ctrl0_ctl19_txtLinkToUrl'), urlOverride);
      }, override);
    }

    // Related Press Release
    if (ev.relatedRelease && ev.relatedRelease.text && ev.relatedRelease.text.length > 0) {
      await this._page.evaluate((relatedRelease: string) => {
        updateSelect('_ctrl0$ctl19$ddlRelatedPressRelease', relatedRelease);
      }, ev.relatedRelease.text);
    }

    // Related Financial Report
    if (ev.relatedFinancial && ev.relatedFinancial.text && ev.relatedFinancial.text.length > 0) {
      await this._page.evaluate((relatedFinancial: string) => {
        updateSelect('_ctrl0$ctl19$ddlRelatedFinancialReport', relatedFinancial);
      }, ev.relatedFinancial.text);
    }

    // Financial Period Quarter
    if (ev.financialPeriodQuarter && ev.financialPeriodQuarter.text && ev.financialPeriodQuarter.text.length > 0) {
      await this._page.evaluate((financialPeriodQuarter: string) => {
        updateSelect('_ctrl0$ctl19$ddlRelatedReportQuarter', financialPeriodQuarter);
      }, ev.financialPeriodQuarter.text);
    }

    // Financial Period Year
    if (ev.financialPeriodYear && ev.financialPeriodYear.text && ev.financialPeriodYear.text.length > 0) {
      await this._page.evaluate((financialPeriodYear: string) => {
        updateSelect('_ctrl0$ctl19$ddlRelatedReportYear', financialPeriodYear);
      }, ev.financialPeriodYear.text);
    }
    
    // Related Presentation
    if (ev.relatedPresentation && ev.relatedPresentation.text && ev.relatedPresentation.text.length > 0) {
      await this._page.evaluate((relatedPresentation: string) => {
        updateListbox('_ctrl0$ctl19$lstRelatedPresentation', relatedPresentation);
      }, ev.relatedPresentation.text);
    }

    // Related Webcast
    if (ev.relatedWebcast){
      const override = ev.relatedWebcast instanceof URL ? ev.relatedWebcast.toString() : ev.relatedWebcast.localPath;
      await this._page.evaluate((relatedWebcast: string) => {
        updateText(document.querySelector('#_ctrl0_ctl19_txtRelatedWebcast'), relatedWebcast);
      }, override);
    }

    if (ev.speakers) {
      await this._page.evaluate((name: string, title: string) => {
        // @ts-ignore: Unreachable code error
        angular.element(document.querySelector('div[ng-app="SpeakerEditApp"] a[ng-click="addNewEntity()"]')).triggerHandler('click');
        document.querySelector<HTMLInputElement>('input[ng-model="edited.speakerName"]').value = name;
        document.querySelector<HTMLInputElement>('input[ng-model="edited.speakerPosition"]').value = title;
      }),
      await this._page.evaluate(() => {
        document.querySelector<HTMLAnchorElement>('div[ng-app="SpeakerEditApp"] > div > div.child-form-container > div.form-button-panel > a.action-button.action-button--light-bg.action-button--standard').click();
      });
    }

    // Attachments
    if (ev.attachments && ev.attachments.length > 0){
      for (const attachment of ev.attachments){
        const localPath = attachment.file.localPath.toString();
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

    // Arbitrary wait.
    await this._page.waitForTimeout(2000);
    
    // Create SEO Friendly Name
    const [month, day, year] = ev.startDate.to_string().split('/');
    let seoName = convertStringToCMSPageUrl(ev.title);
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
      await this._page.click('#_ctrl0_ctl19_ctl02_btnSave');
      await this._page.waitForSelector('#_ctrl0_ctl19_ucMessages_validationsummary');
      const newHref = await this._page.evaluate(() => {
        const message = document.querySelector('#_ctrl0_ctl19_ucMessages_UserMessage');
        if (!message.classList.contains('message-success')) {
          throw new Error(message.querySelector<HTMLElement>('.message-content').innerText);
        }
        return window.location.href;
      });
      ev.createdHref = new URL(newHref);
      ev.state = State.Created;
      return true;
    } catch(e){
      console.error("Error with: ", ev.title, "Error Message: ", e);
      return false;
    }

  }
}
