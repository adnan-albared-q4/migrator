import * as puppeteer from 'puppeteer';

/*
  Check whether or not page is still loading information.
*/
export async function waitTillHTMLRendered(page: puppeteer.Page | puppeteer.Frame, timeout: number = 30000) {
  try {

    const checkDurationMsecs = 1000;
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;

    while (checkCounts++ <= maxChecks) {
      let html = await page.content();
      let currentHTMLSize = html.length;

      let bodyHTMLSize = await page.evaluate(() => {
        try {
          return document.body.innerHTML.length
        } catch (e) {
          return 0;
        }
      });

      // console.log('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

      if (lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
        countStableSizeIterations++;
      else
        countStableSizeIterations = 0; //reset the counter

      if (countStableSizeIterations >= minStableSizeIterations) {
        // console.log("Page rendered fully..");
        break;
      }

      lastHTMLSize = currentHTMLSize;
      await page.waitForTimeout(checkDurationMsecs);
    }
  } catch (e) {
    function sleep(ms: number) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }
    await sleep(3000);
    await waitTillHTMLRendered(page, timeout);
  }
};

export function updateText(input: HTMLInputElement, value: string) {
  input.focus();
  input.value = value;
  input.blur();
}

export function updateSelect(name: HTMLSelectElement, value: string | number) {
  value = typeof value === 'number' ? value.toString() : value;

  const select = document.querySelector<HTMLSelectElement>(`select.control-dropdown[name*="${name}"]`);
  if (!select) return;

  const options = Array.from(select.children);

  for (const option of options) {
    const o = option as HTMLOptionElement;
    if (o.innerText === value) {
      select.value = o.value;
      select.dispatchEvent(new Event('change'));
      break;
    }
  }
}

/*
  Click on next button to load next page if it's available.
  findCurrent should be a function that looks for the current selector
  findNextFromCurrent is a function, where starting from the current, attempts to find the
  next button.
*/
export async function clickNextPageIfAvailable (
  page: puppeteer.Page, 
  currentSelector: string, 
  findNextFromCurrent: (current: Element) => Promise<Element | null>
) {
  await page.exposeFunction('findNextFromCurrent', findNextFromCurrent);

  return await page.evaluate(async (currentSelector: string) => {
    const current = document.querySelector(currentSelector);
    if (current) {
      // @ts-ignore is needed here because the exposed function is not recognized by TypeScript
      // but we know it exists because we just exposed it
      // @ts-ignore
      const next = await findNextFromCurrent(current);
      if (next) {
        (next as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, currentSelector);
}

export async function scrollDownInfinitePage(page: puppeteer.Page, scrollAmountInPixels: number = 1000) {
  let lastHeight = await page.evaluate(() => document.body.scrollHeight);

  while (true) {
    await page.evaluate((pixels: number) => {
      window.scrollBy(0, pixels);
    }, scrollAmountInPixels);
  
    const newHeight = await page.evaluate(() => document.documentElement.scrollTop);
    await waitTillHTMLRendered(page);

    if (newHeight === lastHeight) {
      break;
    }

    lastHeight = newHeight;    
  }
}

export async function clearBrowserCookies(page: puppeteer.Page) {
  const client = await page.target().createCDPSession();   
  await client.send('Network.clearBrowserCookies');
}

/**
 * Delays execution for a specified number of milliseconds
 */
export async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}