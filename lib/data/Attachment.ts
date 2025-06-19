import { CMSFile } from "./CMSFile";

export enum AttachmentType {
  Document='Document',
  Presentation='Presentation',
  Video='Video',
  Audio='Audio',
}

export function parseAttachmentType(str: string): AttachmentType {
  const formattedStr = str.charAt(0).toUpperCase() + str.slice(1);
  if (formattedStr === 'Document' || formattedStr === 'Presentation' || formattedStr === 'Video' || formattedStr === 'Audio') {
    return AttachmentType[formattedStr];
  }
  throw new Error(`Invalid attachment type: ${str}`);
}

export enum AttachmentDocumentType {
  File='File',
  Online='Online',
}

export function parseAttachmentDocumentType(str: string): AttachmentDocumentType {
  const formattedStr = str.charAt(0).toUpperCase() + str.slice(1);
  if (formattedStr === 'File' || formattedStr === 'Online') {
    return AttachmentDocumentType[formattedStr];
  }
  throw new Error(`Invalid attachment document type: ${str}`);
}

export class Attachment {
  private _title: string;
  private _type: AttachmentType;
  private _docType: AttachmentDocumentType;
  private _file: CMSFile;
  constructor(title: string, type: AttachmentType, docType: AttachmentDocumentType, file: CMSFile){
    this._title = title;
    this._type = type;
    this._docType = docType;
    this._file = file;
  }  
  public set file(p: CMSFile) {
    this._file = p;
  }
  public get file(): CMSFile {
    return this._file;
  }
  public get title() {
    return this._title;
  }
  public set title(s: string){
    this._title = s;
  }
  objectify(){
    return {
      title: this._title,
      type: this._type.toString(),
      docType: this._docType.toString(),
      file: this._file.objectify(),
    }
  }  
}
