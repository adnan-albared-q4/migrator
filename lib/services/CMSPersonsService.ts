/*
  A service class responsible for scraping and creating Persons entries
*/

import CMSService, {ContentMenuName} from './CMS';
import { Persons } from '../data/Persons';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { Select } from '../data/Select';
import { isAbsoluteUrl } from '../helpers/String';
import { CMSFile } from '../data/CMSFile';
import * as path from 'path';
import { State } from '../data/State';

interface Scrapable {
  gotoToindex();
  scrapeDetails(per: Persons);
  scrapeIndex();
  scrapeContentTable();
  create(per: Persons);
}

type CMSTableData = {
    href: string;
    name: string;
}
// type ScrapedImage = {
//   title: string,
//   path: string,
// }

export class CMSPersonsService extends CMSService implements Scrapable {
    async gotoToindex(){
    await this.gotoContentIndexPage(ContentMenuName.PersonList);
  }

  async scrapeIndex(maxPages=-1): Promise<Array<Persons>> {
    await this.gotoToindex();
    
    let tableData: Array<Persons> = [];
    let scrapeTable = true;
    while (scrapeTable && (maxPages === -1)) {
      await waitTillHTMLRendered(this._page);

      const current = await this.scrapeContentTable();

      tableData = tableData.concat(current);
      // There is no pagination on persons lists
      scrapeTable = false;
    }
    return tableData;
  }
  
  async scrapeContentTable(): Promise<Array<Persons>> {
    const scraped = await this._page.evaluate(() => {
      const tableData: Array<CMSTableData> = [];
      const rows = document.querySelectorAll('.grid-list tbody tr:not(:first-child):not(:last-child)');
      for (const row of rows){
        const href = row.querySelector<HTMLAnchorElement>('td:nth-child(1) > a').href;
        const name = row.querySelector<HTMLTableCellElement>('td:nth-child(2)').textContent;
        tableData.push({ href, name });
      }
      return tableData;
    });

    const parsed: Array<Persons> = scraped.map((entry) => {
      let firstName;
      let lastName;
      if (entry.name !== undefined && entry.name !== null){
        const splitName = entry.name.split(' ');
        firstName = splitName.slice(0, (splitName.length / 2)).join(' ');
        lastName = splitName.slice((splitName.length / 2), splitName.length).join(' ');
      } 
      return new Persons({
        firstName: firstName,
        lastName: lastName,
        href: entry.href,
        state: State.Index
      });
    });

    return parsed;

  }

  async scrapeDetails(per: Persons) {
    
    console.log('Scraping:', per.firstName, per.lastName);
    await this._page.goto(per.href.toString(), { 
      waitUntil: 'networkidle0' 
    });

    await waitTillHTMLRendered(this._page);

    const category = await this._page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlDepartment');
      return {
        // return the same text for value and text to populate correct category on create step
        value: select.options[select.selectedIndex].innerText,
        text: select.options[select.selectedIndex].innerText,
      }
    });

    per.category = new Select(category.value, category.text);

    const firstName = await this._page.evaluate(() => {
      const firstName = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtFirstName').value;
      return firstName;
    });
    per.firstName = firstName;

    const lastName = await this._page.evaluate(() => {
      const lastName = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtLastName').value;
      return lastName;
    });
    per.lastName = lastName;

    const suffix = await this._page.evaluate(() => {
      const suffix = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtSuffix').value;
      return suffix;
    });
    per.suffix = suffix;

    //For Persons, body is the Description field
    const body = await this._page.evaluate(() => {
      const body = document.querySelector<HTMLTextAreaElement>('#_ctrl0_ctl19_txtDescription').value;
      return body;
    });
    per.body = body;

    const highlights = await this._page.evaluate(() => {
      const highlights = document.querySelector<HTMLTextAreaElement>('#_ctrl0_ctl19_txtCareerHighlight').value;
      return highlights;
    });
    per.highlights = highlights;

    const tags = await this._page.evaluate(() => {
      const tagsAsString = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_TagSelection_txtTags').value.trim();
      return tagsAsString ? tagsAsString.split(' ') : [''];
    });
    per.tags = tags;

    /* 
      TODO: Image importing/exporting to be added after FileExplorer.ts updated to include extracting files
    */
    // const relatedImg = await this._page.evaluate(() => {
    //   return document.querySelector<HTMLImageElement>('#_ctrl0_ctl19_UCPhotoPath_imgImage')?.src;
    // });

    // if (relatedImg !== null && relatedImg !== undefined){
    //   let url = new URL(relatedImg);

    // if (!isAbsoluteUrl(relatedImg)){
    //     let baseUrl: string;
    //     try {
    //       baseUrl = this._baseFilesUrl.toString();
    //     } catch (e) {
    //       throw new Error(`Please provide a bucket to download files from the Q4 server. Add a baseFilesUrl to your settings.js file.`);
    //     }
    //     url = new URL(baseUrl);
    //     url.pathname = path.join(url.pathname, relatedImg);
    //   }
    //   else {
    //     url = new URL(relatedImg);
    //   }
    //   per.relatedImg = new CMSFile(url);
    // }

    /*
      Visibility Options
    */
    per.active = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_chkActive').checked
    });

    per.state = State.Details;

  }

    /*
        Clicks on add a new person from the context of a person page
    */
  async createNew() {
    await this._page.evaluate(() => {
      document.querySelector<HTMLElement>('#_ctrl0_ctl19_btnAddNew_submitButton').click();
    });
    await this._page.waitForTimeout(2000);
    await waitTillHTMLRendered(this._page);
  }

  async isCreateNewPersonsEmpty(){
    const title = await this._page.evaluate(() =>{
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtTitle').value;
    });
    const description = await this._page.evaluate(() => {
      return document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtDescription').value;
    })
    return !title && !description;
  }
  
  async create(per: Persons, test=false){
    /*
      Takes in all the fields from Persons and enters it into a Create Person form
    */

    console.log('Creating:', per.firstName, per.lastName);

    // Ignore this person if active is false or if it's already been created
    if (per.active === false || per.state === State.Created){
      console.log(`Ignoring ${per.title} as active is set to ${per.active}`);
      return;
    }

    /*
      If the page does not have empty fields, continue to press the Create
      New button until it does. This is because the system might take a long
      time to load a Create New PR page.
    */
    do {
      await this.createNew();
    } while (await this.isCreateNewPersonsEmpty() === false);

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
        if (o.innerText.toLowerCase() === value.toLowerCase()) {
          select.value = o.value;
          select.dispatchEvent(new Event('change'));
          break;
        }
      }
    }

    await this._page.addScriptTag({ content: `${updateText} ${updateSelect}` });
   
    // First and Last Name
    await this._page.evaluate((firstName: string) => {
      const firstNameInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtFirstName');      
      updateText(firstNameInput, firstName);      
    }, per.firstName);

    await this._page.evaluate((lastName: string) => {
      const lastNameInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtLastName');      
      updateText(lastNameInput, lastName);      
    }, per.lastName);

    // Title
    await this._page.evaluate((title: string) => {
      const titleInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtTitle');      
      updateText(titleInput, title);      
    }, per.title);


    // Tags
    if (per.tags && per.tags.length > 0){
      await this._page.evaluate((tags: Array<string>) => {
        updateText(document.querySelector('#_ctrl0_ctl19_TagSelection_txtTags'), tags.join(' '));
      }, per.tags);
    }

    // Description
    if(per.body && per.body.length > 0){
      await this._page.evaluate((body: string) => {
        const bodyInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtDescription');
        updateText(bodyInput, body);
        }, per.body);
    }

    //Career Highlights
    if(per.highlights && per.highlights.length > 0){
      await this._page.evaluate((highlights: string) => {
        const highlightsInput = document.querySelector<HTMLInputElement>('#_ctrl0_ctl19_txtCareerHighlight');
        updateText(highlightsInput, highlights);
        }, per.highlights);
    }

    // Category
    if (per.category && per.category.text && per.category.text.length > 0) {
      await this._page.evaluate((category: string) => {
        updateSelect('_ctrl0$ctl19$ddlDepartment', category);
      }, per.category.value);
    }

    //Images
    if (per.relatedImg && per.relatedImg.localPath){
        await this._page.evaluate((path: string) => {
          updateText(document.querySelector('#_ctrl0_ctl19_UCPhotoPath_imgImage'), path);
        }, per.relatedImg.localPath)
    }

    // Arbitrary wait.
    await this._page.waitForTimeout(2000);
    if (test){
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
      per.createdHref = new URL(newHref);
      per.state = State.Created;
      return true;
    } catch(e){
      console.error("Error with: ", per.firstName, per.lastName);
      return false;
    }

  }
}
