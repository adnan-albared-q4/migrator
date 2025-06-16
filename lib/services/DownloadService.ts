import * as fs from 'fs';
import axios, { Axios } from 'axios';
import * as mkdirp from 'mkdirp';
import { promisify } from 'util';
import * as stream from 'stream';
import * as path from 'path';
import { ContainsDownloadableFiles, Downloadable } from '../data/Downloadable';

const finished = promisify(stream.finished);

export class DownloadService {

  static async downloadFile(file: Downloadable, directory: string){
    const downloadUrl = file.remotePath;
    if (downloadUrl.toString().includes('s4.q4web.com')){
      throw new Error('Cannot download from a Q4 site that requires login.')
    }
  
    if (file.customFilename && file.customFilename !== ''){
      file.localPath = path.join(directory, file.customFilename).split(path.sep).join(path.posix.sep);
    } else {
      console.log("File is ", file.remotePath);
      file.localPath = path.join(directory, path.basename(file.remotePath.toString().split('/').pop())).split(path.sep).join(path.posix.sep);
    }
  
    let response;
    try {
      console.log("Downloading:", file.localPath);
      response = await axios({
        method: 'get',
        url: downloadUrl.toString(),
        responseType: 'stream',
      });
    } catch (e) {
      if (e.response && e.response.status) {
        if (e.response.status === 404){
          file.localPath = null;
          file.remotePath = null;
          file.customFilename = '';
          // throw new Error(`${downloadUrl} returned a 404.`);
        } else if (e.response.status === 403){
          file.localPath = null;
          file.remotePath = null;
          file.customFilename = '';
          // throw new Error(`${downloadUrl} returned a 403.`);
        } else {
          throw new Error(`${downloadUrl} returned status code ${e.response.status}.`)
        }
      }
      return false;
    }
  
    const out = await writeAxiosResponseData(file.localPath, response.data);
    return true;
  }
  static async downloadFilesToDirectory(d: ContainsDownloadableFiles, directory: string){
    const downloadables = d.getDownloadables();
    let successful = true;
    for (const file of downloadables){
      mkdirp.sync(directory);
      const success = await DownloadService.downloadFile(file, directory);
      if (success === false){
        successful = false;
      }
    }
    return successful;
  }
}

async function writeAxiosResponseData(path, data) {
  try {
    const writer = fs.createWriteStream(path);
    data.pipe(writer);
    return finished(writer);
  } catch (e) {
    throw new Error(e);
  }  
}