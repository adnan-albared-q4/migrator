import { CMSDate } from './CMSDate';
import { CMSTime } from './Time';
import { Select } from './Select';
import { Objectifiable } from './Objectifiable';
import { CMSFile } from './CMSFile';
import { Multimedia, parseFileType } from './Multimedia';
import { Attachment, parseAttachmentDocumentType, parseAttachmentType } from './Attachment';
import { UrlOverride } from './UrlOverride';
import { ContainsDownloadableFiles } from './Downloadable';
import { State } from './State';
import { stringToEnumValue } from '../helpers/Enum';

const MAX_TITLE_COUNT = 501;

export type PressReleaseInput = {
  date?: CMSDate | string;
  title?: string;
  time?: CMSTime;
  href?: URL | string;
  category?: Select;
  body?: string;
  tags?: Array<string>;
  relatedDoc?: CMSFile;
  attachments?: Array<Attachment>;
  multimedias?: Array<Multimedia>;
  urlOverride?: UrlOverride;
  openLinkInNewWindow?: boolean;
  exclude?: boolean;
  active?: boolean;
  createdHref?: URL;
  state?: State;
}

export class PressRelease implements Objectifiable, ContainsDownloadableFiles {
  private _date?: CMSDate;
  private _title?: string;
  private _href?: URL;
  private _time?: CMSTime;
  private _body?: string;
  private _category: Select = new Select('', '');
  private _tags: Array<string> = [];
  private _relatedDoc?: CMSFile;
  private _attachments: Array<Attachment> = [];
  private _multimedias: Array<Multimedia> = [];
  private _urlOverride?: UrlOverride;
  private _openLinkInNewWindow: boolean = false;
  private _exclude: boolean = false;
  private _active: boolean = true;
  private _createdHref?: URL;
  private _state: State = State.Uninitialized;
  constructor(input: PressReleaseInput) {

    if (input.date) {
      if (typeof input.date === 'string') {
        this._date = new CMSDate(input.date);
      } else {
        this._date = input.date;
      }
    }

    if (input.title) {
      if (input.title.length >= MAX_TITLE_COUNT) {
        throw new Error("Title cannot be longer than 501 characters.");
      }
      this._title = input.title;
    }

    if (input.href) {
      this._href = typeof input.href === 'string' ? new URL(input.href) : input.href;
    }

    if (input.time) {
      this._time = input.time;
    }

    if (input.category) {
      this._category = new Select(input.category.value, input.category.text);
    }

    if (input.body) {
      this._body = input.body;
    }

    if (input.tags) {
      this._tags = input.tags;
    }

    if (input.relatedDoc) {
      this._relatedDoc = input.relatedDoc;
    }

    if (input.attachments && input.attachments.length > 0) {
      this._attachments = input.attachments;
    }

    if (input.multimedias && input.multimedias.length > 0) {
      this._multimedias = input.multimedias;
    }

    if (input.urlOverride) {
      this._urlOverride = input.urlOverride;
    }

    if (input.openLinkInNewWindow != null) {
      this._openLinkInNewWindow = input.openLinkInNewWindow;
    }

    if (input.exclude != null) {
      this._exclude = input.exclude;
    }

    if (input.active != null) {
      this._active = input.active;
    }

    if (input.createdHref != null) {
      this._createdHref = input.createdHref;
    }

    this._state = input.state != null ? input.state : State.Uninitialized;

  }

  public get title(): string {
    if (this._title == null) {
      throw new Error("Title is not set.");
    }
    return this._title;
  }

  public set title(str: string) {
    this._title = str;
  }

  public set date(input: CMSDate) {
    this._date = input;
  }

  public get date(): CMSDate {
    if (this._date == null) {
      throw new Error("Date is not set.");
    }
    return this._date;
  }

  public get href(): URL | undefined {
    return this._href;
  }

  public get time(): CMSTime | undefined {
    return this._time;
  }

  public set time(t: CMSTime | undefined) {
    this._time = t;
  }

  public set category(c: Select) {
    this._category = c;
  }

  public get category() {
    return this._category;
  }

  public get body(): string | undefined {
    return this._body;
  }

  public set body(body: string | undefined) {
    this._body = body;
  }

  public set tags(tags: Array<string>) {
    this._tags = tags;
  }

  public get tags(): Array<string> {
    if (this._tags == null) {
      return [];
    }
    return this._tags;
  }

  public get relatedDoc(): CMSFile | undefined {
    return this._relatedDoc;
  }

  public set relatedDoc(file: CMSFile | undefined) {
    this._relatedDoc = file;
  }

  public set attachments(a: Array<Attachment>) {
    this._attachments = a;
  }

  public get attachments(): Array<Attachment> {
    return this._attachments;
  }

  public set multimedias(a: Array<Multimedia>) {
    this._multimedias = a;
  }

  public get multimedias() {
    return this._multimedias;
  }

  public get urlOverride(): UrlOverride | undefined {
    return this._urlOverride;
  }

  public set urlOverride(override: UrlOverride | undefined) {
    this._urlOverride = override;
  }

  public set openLinkInNewWindow(b: boolean) {
    this._openLinkInNewWindow = b;
  }

  public get openLinkInNewWindow(): boolean {
    if (this._openLinkInNewWindow == null) {
      throw new Error("Open Link in New Window is not set.");
    }
    return this._openLinkInNewWindow;
  }

  public set exclude(b: boolean) {
    this._exclude = b;
  }

  public get exclude(): boolean {
    if (this._exclude == null) {
      throw new Error("Exclude is not set.");
    }
    return this._exclude;
  }

  public set active(b: boolean) {
    this._active = b;
  }

  public get active(): boolean {
    return this._active;
  }

  public get createdHref(): URL | undefined {
    return this._createdHref;
  }

  public set createdHref(u: URL | undefined) {
    this._createdHref = u;
  }

  public set state(s: State) {
    this._state = s;
  }

  public get state(): State {
    return this._state;
  }

  objectify(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    if (this._time) {
      obj['time'] = {
        hour: this._time.hour,
        minute: this._time.minute,
        meridiem: this._time.meridiem
      };
    }

    if (this._date) {
      obj['date'] = this._date.to_string();
    }

    if (this._title) {
      obj['title'] = this._title;
    }

    if (this._href) {
      obj['href'] = this._href;
    }

    if (this._category) {
      obj['category'] = this._category.objectify();
    }

    if (this._body) {
      obj['body'] = this._body;
    }

    if (this._tags) {
      obj['tags'] = this._tags;
    }

    if (this._relatedDoc) {
      obj['relatedDoc'] = this._relatedDoc.objectify();
    }

    if (this._attachments) {
      const mappedAttachments = this._attachments.map(function(e: Attachment) {
        return e.objectify();
      });
      obj['attachments'] = mappedAttachments;
    }

    if (this._multimedias) {
      const mappedMultimedias = this._multimedias.map(function(e: Multimedia) {
        return e.objectify();
      });
      obj['multimedias'] = mappedMultimedias;
    }

    if (this._urlOverride) {
      if (this._urlOverride instanceof URL) {
        obj['urlOverride'] = this._urlOverride.toString();
      } else {
        obj['urlOverride'] = this._urlOverride.objectify();
      }
    }

    obj['exclude'] = this._exclude;
    obj['openLinkInNewWindow'] = this._openLinkInNewWindow;
    obj['active'] = this._active;

    if (this._createdHref) {
      obj['createdHref'] = this._createdHref.toString();
    }

    obj['state'] = this._state;

    return obj;
  }

  public static convertObjectToClass(o: any) {

    const input: PressReleaseInput = {};

    if (o.date) {
      if (o.date.day && o.date.month && o.date.year) {
        input.date = `${o.date.month}/${o.date.day}/${o.date.year}`;
      }
      else {
        input.date = o.date;
      }
    }

    if (o.time) {
      input.time = new CMSTime(o.time.hour, o.time.minute, o.time.meridiem);
    }

    if (o.title) {
      input.title = o.title;
    }

    if (o.href) {
      input.href = new URL(o.href);
    }

    if (o.category) {
      input.category = new Select(o.category.value, o.category.text);
    }

    if (o.body) {
      input.body = o.body;
    }

    if (o.tags) {
      input.tags = o.tags;
    }

    if (o.relatedDoc) {
      let localPath, customFilename;
      if (o.relatedDoc.localPath && o.relatedDoc.localPath !== '') {
        localPath = o.relatedDoc.localPath;
      }
      if (o.relatedDoc.customFilename && o.relatedDoc.customFilename !== '') {
        customFilename = o.relatedDoc.customFilename;
      }
      input.relatedDoc = new CMSFile(o.relatedDoc.remotePath, customFilename, localPath);
    }

    if (o.attachments) {
      input.attachments = o.attachments.map((e: { 
        title: string; 
        type: string; 
        docType: string; 
        file: { 
          remotePath: string; 
          customFilename?: string; 
          localPath?: string; 
        }; 
      }) => {
        return new Attachment(
          e.title, 
          parseAttachmentType(e.type), 
          parseAttachmentDocumentType(e.docType), 
          new CMSFile(
            new URL(e.file.remotePath), 
            e.file.customFilename || '', 
            e.file.localPath || ''
          )
        );
      });
    }

    if (o.multimedias) {
      input.multimedias = o.multimedias.map((e: {
        title: string;
        type: string;
        file: {
          remotePath: string;
          localPath?: string;
          customFilename?: string;
        };
      }) => {
        return new Multimedia(
          e.title, 
          parseFileType(e.type), 
          new CMSFile(
            new URL(e.file.remotePath),
            e.file.customFilename || '',
            e.file.localPath || ''
          )
        );
      });
    }

    if (o.urlOverride) {
      if (typeof o.urlOverride === 'string') {
        input.urlOverride = new URL(o.urlOverride);
      } else {
        const override = o.urlOverride;
        input.urlOverride = new CMSFile(override.remotePath, override.customFilename, override.localPath);
      }
    }

    if (o.active !== null && o.active !== undefined) {
      input.active = o.active;
    }

    if (o.exclude !== null && o.exclude !== undefined) {
      input.exclude = o.exclude;
    }

    if (o.openLinkInNewWindow !== null && o.openLinkInNewWindow !== undefined) {
      input.openLinkInNewWindow = o.openLinkInNewWindow;
    }

    if (o.createdHref !== null && o.createdHref !== undefined) {
      input.createdHref = new URL(o.createdHref);
    }

    if (o.state !== null && o.state !== undefined) {
      input.state = stringToEnumValue(State, o.state);
    }

    return new PressRelease(input);

  }

  getDownloadables(): Array<CMSFile> {

    const downloadables: Array<CMSFile> = [];

    if (this._urlOverride instanceof CMSFile) {
      downloadables.push(this._urlOverride);
    }

    if (this._attachments) {
      for (const file of this._attachments) {
        downloadables.push(file.file);
      }
    }

    if (this._multimedias) {
      for (const multimedia of this._multimedias) {
        const path = multimedia.file;
        downloadables.push(path);
      }
    }

    if (this._relatedDoc) {
      downloadables.push(this._relatedDoc);
    }

    return downloadables;

  }

}