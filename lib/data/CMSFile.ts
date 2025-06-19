import { isAbsoluteUrl, urlHasFileExtension } from "../helpers/String";
import { Downloadable } from "./Downloadable";
import * as path from 'path';

/*
  CMSFile is used to store PDF/Image/Video metadata.
  remotePath is the source of the file on the internet
  localPath defines the location of the file after it's downloaded to your hard drive for upload
  customFilename is name of the file that will be used when saving the file locally. This is because some remotePaths have no file extensions

*/
export class CMSFile implements Downloadable {
  private _localPath?: string;
  private _remotePath?: URL;
  private _customFilename: string;
  constructor(remotePath: URL, customFilename?: string, localPath?: string) {
    if (isAbsoluteUrl(remotePath.toString())) {
      this._remotePath = remotePath;
    } else {
      throw new Error(`Remote path must be absolute. Received ${remotePath}. Often caused by invalid URL or an empty object that is expected to contain a URL`);
    }
    if (customFilename) {
      this._customFilename = customFilename;
    } else {
      if (urlHasFileExtension(remotePath)) {
        const fileWithParams = remotePath.toString().substring(remotePath.toString().lastIndexOf('/') + 1);
        const file = fileWithParams.substring(0, fileWithParams.indexOf('?'));
        this._customFilename = file;
      } else {
        throw new Error(`
        Error processing link: File does not have an extension. You should provide constructor a custom filename 
        with an extension so that on the download step, the downloader knows which file extension to use.`);
      }
    }
    if (localPath) {
      this._localPath = localPath;
    }
  }
  objectify() {
    const output: Record<string, string> = {};
    if (this._customFilename) {
      output.customFilename = this._customFilename;
    }
    if (this._remotePath) {
      output.remotePath = this._remotePath.toString();
    }
    if (this._localPath && this._localPath !== '') {
      output.localPath = this._localPath;
    }
    return output;
  }
  public get localPath(): string {
    return this._localPath ? this._localPath.split(path.sep).join(path.posix.sep) : '';
  }
  public set localPath(url: string) {
    if (url === '') {
      this._localPath = undefined;
    } else {
      this._localPath = url.split(path.sep).join(path.posix.sep);
    }
  }
  public get remotePath(): URL {
    if (!this._remotePath) {
      throw new Error('Remote path is not set');
    }
    return this._remotePath;
  }
  public set remotePath(url: URL) {
    this._remotePath = url;
  }
  public get customFilename(): string {
    return this._customFilename;
  }
  public set customFilename(filename: string) {
    this._customFilename = filename;
  }
  public equals(other: CMSFile){
    return other.localPath === this.localPath && 
      other.customFilename === this.customFilename && 
      other.remotePath.toString() === this.remotePath.toString();
  }

}