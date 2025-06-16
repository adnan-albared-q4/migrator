import * as puppeteer from 'puppeteer';
import User from '../data/User';
import * as dotenv from 'dotenv';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';

// Load environment variables
dotenv.config();

export enum ContentMenuName {
  PressRelease = 'News (Press Releases)',
  Events = 'Events',
  Presentations = 'Presentations',
  PersonList = 'Person List',
  DownloadList = 'Download List'
}

interface CMSServiceConfig {
  url: URL;
  page: puppeteer.Page;
  baseFilesUrl?: URL;
}

interface ElementInfo {
  tagName: string;
  textContent: string | null;
  innerHTML: string;
  outerHTML: string;
  className: string;
  id: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

export class CMSService {
  private _url: URL;
  private _user: User;
  private _page: puppeteer.Page;
  private _baseFilesUrl?: URL;
  private _document: Document | null = null;

  constructor(config: CMSServiceConfig) {
    this._url = config.url;
    this._page = config.page;
    this._baseFilesUrl = config.baseFilesUrl;
    
    const username = process.env.CMS_USER;
    const password = process.env.CMS_PASSWORD;
    
    if (!username || !password) {
      throw new Error("CMS_USER and CMS_PASSWORD environment variables are required");
    }
    
    this._user = new User(username, password);
  }

  async login(credentials?: LoginCredentials) {
    console.log('🔑 Logging in...');
    
    const username = credentials?.username || process.env.CMS_USER;
    const password = credentials?.password || process.env.CMS_PASSWORD;

    if (!username || !password) {
      throw new Error('CMS_USER and CMS_PASSWORD environment variables are required');
    }

    await this._page.goto(this._url.toString());
    await waitTillHTMLRendered(this._page);

    await this._page.waitForSelector('#txtUserName');
    await this._page.type('#txtUserName', username);
    await this._page.type('#txtPassword', password);
    await this._page.click('#btnSubmit');

    await Promise.race([
      this._page.waitForNavigation({ waitUntil: 'networkidle0' }),
      waitTillHTMLRendered(this._page)
    ]);

    await this._page.waitForTimeout(2000);
  }

  async gotoContentIndexPage(name: ContentMenuName) {
    console.log(`🔍 Looking for ${name} link...`);
    
    // First wait for the menu to be visible
    await this._page.waitForSelector('.level3', { timeout: 60000 });
    await this._page.waitForTimeout(1000);

    const clicked = await this._page.evaluate((name: string) => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".level3 > li > a"));
      const navLink = links.find(link => link.textContent?.trim() === name);
      
      if (navLink) {
        navLink.click();
        return true;
      }
      return false;
    }, name.toString());

    if (!clicked) {
      throw new Error(`Could not find navigation link for ${name}`);
    }

    await Promise.all([
      this._page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
      waitTillHTMLRendered(this._page)
    ]);

    await this._page.waitForTimeout(2000);
  }

  async gotoNextIndexPage(): Promise<boolean> {
    return await this._page.evaluate(() => {
      const pagerSpan = document.querySelector(".DataGridPager > td > span");
      if (!pagerSpan) return false;
      
      const next = pagerSpan.nextElementSibling as HTMLAnchorElement | null;
      if (!next) return false;

      next.click();
      return true;
    });
  }

/* TODO: For a Redesign site, how can we cycle through the existing drop-downs and load up the next list to scrape in all items? */

  // async gotoNextDropdown(): Promise<any> {
  //   async function dropSelect(drop, opt) {
  //     await this._page.select(drop, opt);
  //     await this._page.waitForNavigation();
  //   }
  //   await this._page.evaluate(async () => {
  //     const dropDown = document.querySelector<HTMLSelectElement>('#_ctrl0_ctl19_ddlReportType');
  //     const nextOption = dropDown.querySelector(' option[selected=selected]').nextElementSibling as HTMLSelectElement | null;
  //     if (nextOption){
  //       await dropSelect(`${dropDown}`, `${nextOption}`);
  //       return true;
  //     } else {
  //       return false;
  //     }
  //   })
  
  // }

  async getElements(selector: string): Promise<ElementInfo[]> {
    return await this._page.$$eval(selector, (elements) => 
      elements.map(el => ({
        tagName: el.tagName,
        textContent: el.textContent,
        innerHTML: el.innerHTML,
        outerHTML: el.outerHTML,
        className: el.className,
        id: el.id
      }))
    );
  }
}

export default CMSService;