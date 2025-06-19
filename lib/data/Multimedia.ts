import { CMSFile } from "./CMSFile";

export enum FileType {
  Image = 'Image',
  Video = 'Video',
}

export function parseFileType(str: string): FileType {
  const formattedStr = str.charAt(0).toUpperCase() + str.slice(1);
  if (formattedStr === 'Image' || formattedStr === 'Video') {
    return FileType[formattedStr];
  }
  throw new Error(`Invalid file type: ${str}`);
}

export class Multimedia {
  private _title: string;
  private _type: FileType;
  private _file: CMSFile;
  constructor(title: string, type: FileType, file: CMSFile) {
    this._title = title;
    this._type = type;
    this._file = file;
  }
  public set file(p: CMSFile) {
    this._file = p;
  }
  public get file(): CMSFile {
    return this._file;
  }
  public set title(str: string){
    this._title = str;
  }
  public get title() {
    return this._title;
  }
  public set type(type: FileType) {
    this._type = type;
  }
  public get type() {
    return this._type;
  }
  objectify() {
    let file = this._file.objectify();
    return {
      title: this._title,
      type: this._type.toString(),
      file: file,
    }
  }
}
