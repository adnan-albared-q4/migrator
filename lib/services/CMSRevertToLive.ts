/*
    A service class responsible for scraping and reverting bad CMS imports
*/

import CMSService from './CMS';
import { Dashboard } from '../data/Dashboard';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import { State } from '../data/State';

interface Scrapable {
    gotoToindex();
    scrapeIndex();
    scrapeContentTable();
}

type CMSTableData = {
    href: string;
    title: string;
}

export class CMSRevertToLive extends CMSService implements Scrapable{
    async gotoToindex() {
      // console.log('Dashboard reached');
    }

    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    async scrapeIndex(maxPages: number=-1): Promise<Array<Dashboard>> {
        await this.gotoToindex();
        let tableData: Array<Dashboard> = [];
        let scrapeTable = true;
        const currentPage = 0;
        while (scrapeTable && (maxPages === -1 || currentPage < maxPages)) {
          await waitTillHTMLRendered(this._page);
          const current = await this.scrapeContentTable();
          
          tableData = tableData.concat(current);
          scrapeTable = false;
        }
        return tableData;
    }

    async scrapeContentTable(): Promise<Array<Dashboard>> {
        const scraped = await this._page.evaluate(() => {
          const tableData: Array<CMSTableData> = [];
          const rows = document.querySelectorAll('.grid-list tbody tr:not(:first-child)');
          for (const row of rows){
            const href = row.querySelector<HTMLAnchorElement>('td:nth-child(1) > a').href;
            const title = row.querySelector<HTMLTableCellElement>('td:nth-child(2)').textContent;
            tableData.push({ href, title });
          }
          return tableData;
        });
        
        const parsed: Array<Dashboard> = scraped.map((entry) => {

          return new Dashboard({
            title: entry.title,
            href: entry.href,
            state: State.Index
          });
        });
        
        return parsed;
      }

    async revertEntries(ent: Dashboard) {
      console.log('Reverting:', ent.title);
      await this._page.goto(ent.href.toString(), {
        waitUntil: 'networkidle0'
      });

      await waitTillHTMLRendered(this._page);
      await this._page.evaluate(() => {
        document.querySelector<HTMLButtonElement>('a#_ctrl0_ctl19_ctl00_btnRevert')?.click();
        document.querySelector<HTMLButtonElement>('a#_ctrl0_ctl19_ctl01_btnRevert')?.click();
        document.querySelector<HTMLButtonElement>('a#_ctrl0_ctl19_ctl02_btnRevert')?.click();
        document.querySelector<HTMLButtonElement>('a#_ctrl0_ctl19_ctl03_btnRevert')?.click();
        document.querySelector<HTMLButtonElement>('a#_ctrl0_ctl19_ctl04_btnRevert')?.click();
        document.querySelector<HTMLButtonElement>('a#_ctrl0_ctl19_ctl05_btnRevert')?.click();
      });
      await waitTillHTMLRendered(this._page);
    }
}