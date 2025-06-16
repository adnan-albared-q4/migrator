import puppeteer from 'puppeteer';

type PuppeteerOptions = {
  headless?: boolean;
  width?: number;
  height?: number;
}

type PuppeteerObjects = {
  browser: puppeteer.Browser;
  page: puppeteer.Page;
}

export async function launchPuppeteer(o: PuppeteerOptions = { headless: false, width: 1600, height: 900 }): Promise<PuppeteerObjects> {
  const browser = await puppeteer.launch({
    headless: o.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage(); 

  await resizeWindow(page, o.width ?? 1600, o.height ?? 900);

  return { browser, page };
}

/*
  Resize Chrome window so that it's easier to see what's happening.
*/
export async function resizeWindow(page: puppeteer.Page, width: number, height: number) {
  const session = await page.target().createCDPSession();
  await page.setViewport({ height, width });
  const { windowId } = await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds', {
    bounds: { height, width },
    windowId,
  });
}
