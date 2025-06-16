import * as puppeteer from 'puppeteer';
import { CMSFile } from '../data/CMSFile';
import { waitTillHTMLRendered } from '../helpers/Puppeteer';
import * as path from 'path';

/*
  FileExplorer is responsible for initializing and uploading 
  files stored locally to a CMS.

  The main entry point is uploadCMSFiles which takes an array of CMSFile
  and will upload them one by one, using the localPath property to determine
  the folder to create.
*/
export class FileExplorer {
  _page: puppeteer.Page;
  _timeout: number;
  _injectors: FileExplorerInjector;
  _frame: puppeteer.Frame;
  constructor(page, timeout = 1000) {
    this._page = page;
    this._timeout = timeout;
    this._injectors = new FileExplorerInjector();
  }

  /*
      Opens the CMS file explorer
  */
  async init() {
    await this._page.waitForTimeout(1000);

    await this._page.evaluate(this._injectors.openFileExplorer);

    await this._page.waitForFunction(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const frame = iframes.filter((iframe) => iframe.src.includes('Telerik.Web.UI.DialogHandler'));
      const domNode = frame[0].contentWindow.document.querySelector('.rtbIconOnly.icnNewFolder.rtbWrap');
      return frame.length && domNode && domNode.clientHeight && domNode.clientWidth;
    }, {
      timeout: 0
    }
    );

    this._frame = this._page.frames().find(function (frame) {
      return frame.url().indexOf('Telerik.Web.UI.DialogHandler') !== -1;
    });

    await this._page.waitForTimeout(1000);

    console.log('opened CMS file explorer');

  }

  /*
      Uses Puppeteer's waitForFunction to check for an element to both be in the DOM
      and visible on the screen.
  */
  async waitForElementToAppear(selector, timeout = 50000) {
    await this._frame.waitForFunction(
      `document.querySelector('${selector}') && document.querySelector('${selector}').clientHeight`,
      { timeout }
    );
  }

  async uploadCMSFiles(files: Array<CMSFile>) {
    let success = true;
    for (const file of files) {
      const localPath = file.localPath.split(path.sep).join(path.posix.sep);
      const result = await this.uploadDocument(localPath, path.parse(localPath).dir);
      // #TODO Figure out states of upload/download
      if (result === false) {
        success = false;
      }
    }
    return success;
  }
  /*
    Start at the root files folder, and create the folder
    structure necessary to match the file path.
 
    Then it will upload the file, and make it public.
    localFilePath: the absolute file path for the file to be uploaded
    cmsFilePath: the path (including the file name) of the file to be uploaded
  */
  async uploadDocument(localFilePath: string, cmsFilePath: string) {
    try {
      if (!localFilePath) {
        return false;
      }
      const folders = cmsFilePath.split("/").filter((entry) => entry.length);
      console.log(`uploading ${localFilePath}`);

      // 1. click 'files' folder
      await this.clickFilesFolder();

      // 2. create subfolder
      await this.createFilePathAsNeeded(folders, 0);

      // 3. upload the document
      await this.openUploadFileWindow();
      await this.populateUploadFileInputField(localFilePath);

      console.log(`upload ${localFilePath}`);
      await this.clickUploadFile();

      // 4. Make the file public, assuming the newly uploaded file is automatically selected upon upload
      // await this.makeSelectedFilePublic(localFilePath.split('/').pop());

      return true;
    } catch (e) {
      console.log(`error uploading: ${localFilePath}: ${e}`);
      return false;
    }
  }

  /*
      Clicks the New Folder dialog box.
  */
  async openNewFolderWindow() {

    await this._frame.evaluate(this._injectors.clickNewFolder);
    await this.waitForElementToAppear('input[value="NewFolder"]');
    console.log(`clicked new folder`);

  }

  /*
      Creates a new folder from the current selected directory.
  */
  async createFolder(folderName) {

    await this.openNewFolderWindow();
    await this._frame.evaluate(this._injectors.createNewFolder, folderName);

    await waitTillHTMLRendered(this._frame);
    console.log(`created ${folderName}`);
  }

  /*
      Make a file in the selected directory public.
      Find file in open list, click the file, right click, click on Make Public, click on confirm.
  */
  async makeSelectedFilePublic(fileName) {

    await this._frame.evaluate(this._injectors.rightClickFileInCurrentFileList, fileName);

    await this.waitForElementToAppear('#RadFileExplorer1_gridMenu_detached');
    await waitTillHTMLRendered(this._frame);

    const clickedMakePublic = await this._frame.evaluate(this._injectors.clickMakePublic);

    if (clickedMakePublic) {
      await this.waitForElementToAppear('.rwDialogPopup');
      await this._frame.evaluate(() => {
        document.querySelector<HTMLAnchorElement>('.rwDialogPopup a').click();
      });
      await waitTillHTMLRendered(this._frame);
      console.log(`make public: ${fileName}`);
    } else {
      console.log('file was already public');
    }
    await this._page.waitForTimeout(2000);

  }

  /*
Opens the Upload dialog box
*/
  async openUploadFileWindow() {
    await this._frame.evaluate(this._injectors.clickUploadNewFileButton);
    await this.waitForElementToAppear('input[type="file"]');
  }

  /*
      Puts a file in the hidden upload input field located in the Upload dialog box.
      Then, use Puppeteer's uploadFile method to upload the specific file.
      Then wait till it's fully uploaded before proceeding.
  */
  async populateUploadFileInputField(filePath, overWriteFile = true) {

    await this._frame.evaluate((overWriteFile) => {
      document.querySelector<HTMLInputElement>('#RadFileExplorer1_chkOverwrite').checked = overWriteFile;
    }, overWriteFile);

    const input = await this._frame.evaluateHandle(() => {
      return document.querySelector<HTMLInputElement>('input[type="file"]');
    });

    // Not sure how to make the types work for upload
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await input.uploadFile(filePath);

    await this.waitForElementToAppear('.ruInputs .ruFileWrap.ruStyled .ruUploadProgress.ruUploadSuccess', 0);
    console.log(`uploaded ${filePath}`);

  }

  /*
    Click the upload file button in the upload file dialog box.
  */
  async clickUploadFile() {
    await this._frame.evaluate(this._injectors.clickUploadSubmitButton);
    // TODO: Await element appears in file list
    //await this._page.waitForTimeout(this.timeout * 5);
    await waitTillHTMLRendered(this._page);
  }

  /*
    Given an array of folder names and a current index,
    recursively create folders that don't already exist.    
  */
  async createFilePathAsNeeded(folders, currentIndex) {
    if (currentIndex >= folders.length) return;

    if ((folders[currentIndex] !== "files") || (folders[currentIndex] === "files" && currentIndex !== 0)) {
      await this.createAsNeededThenClick(folders[currentIndex]);
    }
    await this.createFilePathAsNeeded(folders, currentIndex + 1);
  }

  /* 
      Returns the element (if available)
  */
  async getSelectedHandleFromFolderTree(folderName) {
    const node = await this._frame.evaluateHandle(this._injectors.searchForFolderInCurrentFolderTree, folderName);
    const notEmpty = await this._frame.evaluate((el) => el ? true : false, node); // If the node has text, it's not null
    await this._frame.waitForTimeout(1000);
    return notEmpty ? node : null;
  }

  async getFileFromFileList(fileName) {
    const node = await this._frame.evaluateHandle(this._injectors.searchForFileInCurrentFileList, fileName);
    const notEmpty = await this._frame.evaluate((el) => el ? true : false, node); // If the node has text, it's not null
    return notEmpty ? node : null;
  }

  async createAsNeededThenClick(folderName) {
    // If the folder name doesn't exist, then create the folder
    const node = await this.getSelectedHandleFromFolderTree(folderName);
    if (!node) {
      await this.createFolder(folderName);
    }
    // click the folder
    await this.clickFolder(folderName);
  }

  /* 
      Files is the base folder for the entire files system
  */
  async clickFilesFolder() {

    await this._frame.evaluate(() => {
      document.querySelector<HTMLSpanElement>("#RadFileExplorer1_tree .rtTop > .rtIn > .rtTemplate span:last-child").click();
    });
    await this._page.waitForTimeout(1000);

  }

  async clickFile(fileName) {

    const handle = await this.getFileFromFileList(fileName);
    try {
      await this._frame.evaluate(this._injectors.clickWithHandle, handle);
      await handle.dispose();
      await this._page.waitForTimeout(this._timeout);
    } catch (e) {
      throw new Error('file does not exist in open folder. ' + e);
    }

  }

  async clickFolder(folderName) {

    const handle = await this.getSelectedHandleFromFolderTree(folderName);
    try {
      await this._frame.evaluate(this._injectors.clickWithHandle, handle);
      await handle.dispose();
      await this._page.waitForTimeout(this._timeout);
    } catch (e) {
      throw new Error('folder does not exist in open folder ' + e);
    }

  }

}


class FileExplorerInjector {
  openFileExplorer() {
    document.querySelector<HTMLElement>("#quicktasksOpen").click();
    document.querySelector<HTMLElement>("#commonSelector").click();
    document.querySelector<HTMLElement>('#lastchangedCommon a[id*="ManageFiles"]').click();
  }
  handleIsNotEmpty() {

  }
  clickNewFolder() {
    document.querySelector<HTMLElement>('[title="New Folder"]').click();
  }
  createNewFolder(name: string) {
    document.querySelector<HTMLInputElement>('.rwWindowContent [value="NewFolder"]').value = name;
    document.querySelector<HTMLElement>(".rwWindowContent .rwPopupButton").click();
  }
  clickUploadSubmitButton() {
    document.querySelector<HTMLElement>("#RadFileExplorer1_btnUpload_input").click();
  }
  clickUploadNewFileButton() {
    document.querySelector<HTMLElement>('[title="Upload"]').click();
  }
  rightClickHandle(handle) {
    const rightClickEvent = new MouseEvent("contextmenu");
    handle.dispatchEvent(rightClickEvent);
  }
  rightClickFileInCurrentFileList(fileName: string) {
    const table = document.querySelector<HTMLTableElement>('#RadFileExplorer1_grid_ctl00');
    const rows = table.querySelectorAll(':scope > tbody > tr');

    let selector;
    for (const row of rows) {
      if (row.querySelector(".rfeFileExtension") && row.querySelector<HTMLElement>(".rfeFileExtension").innerText.trim() === fileName) {
        selector = row;
        selector.click();
        break;
      }
    }

    if (selector) {
      const rightClickEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: false,
        view: window,
        button: 2,
        buttons: 0,
        clientX: selector.getBoundingClientRect().x,
        clientY: selector.getBoundingClientRect().y
      });
      selector.dispatchEvent(rightClickEvent);
    }

  }
  searchForFileInCurrentFileList(fileName: string) {
    const table = document.querySelector('#RadFileExplorer1_grid_GridData > table');
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr:not([style*="display: none"])'));
    const found = rows.find((row) => {
      return row.querySelector('.rfeFileExtension') && (row.querySelector<HTMLElement>('.rfeFileExtension').innerText.trim() === fileName);
    })
    return found;
  }
  searchForFolderInCurrentFolderTree(folderName) {
    const selectedFolder = document.querySelector('.rtSelected');
    const nextFolderNode = selectedFolder.nextElementSibling;
    if (nextFolderNode) {
      const foldersInSelectedFolder = Array.from(nextFolderNode.querySelectorAll(':scope > li > div > div.rtIn'));
      const found = foldersInSelectedFolder.find((folder) => {
        const name = folder.querySelector<HTMLElement>(':scope > div.rtTemplate > span:last-child').innerText.trim();
        return name === folderName;
      });
      return found;
    }
    return null;
  }
  clickWithHandle(node, selector) {
    if (selector) {
      node.querySelector(selector).click();
    } else {
      node.click();
    }
  }
  clickMakePublic() {
    let contextMenuSelector;
    /* 
        There are two custom right menus. Choose the one that isn't hidden
    */
    if (document.querySelector<HTMLElement>('#RadFileExplorer1_gridMenu_detached').style.display !== 'none') {
      contextMenuSelector = '#RadFileExplorer1_gridMenu_detached';
    } else if (document.querySelector<HTMLElement>('#RadFileExplorer1_tree_RadTreeViewContextMenu1_detached').style.display !== 'none') {
      contextMenuSelector = '#RadFileExplorer1_tree_RadTreeViewContextMenu1_detached';
    } else {
      return;
    }
    const makePublicButton = document.querySelector<HTMLElement>(`${contextMenuSelector} > ul > li:nth-child(6) > a`);

    if (makePublicButton.classList.contains('rmDisabled')) {
      return false;
    } else {
      makePublicButton.click();
      return true;
    }

  }
}
