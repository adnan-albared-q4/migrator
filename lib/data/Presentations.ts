import { CMSDate } from './CMSDate';
import { CMSTime } from './Time';
import { Objectifiable } from './Objectifiable';
import { CMSFile } from './CMSFile';
import { UrlOverride } from './UrlOverride';
import { ContainsDownloadableFiles } from './Downloadable';
import { State } from './State';
import { stringToEnumValue } from '../helpers/Enum';

const MAX_TITLE_COUNT = 501;

export type PresentationsInput = {
    date?: CMSDate | string;
    title?: string;
    time?: CMSTime;
    href?: URL | string;
    body?: string;
    tags?: Array<string>;
    relatedDoc?: CMSFile;
    urlOverride?: UrlOverride;
    audioFile?: CMSFile;
    videoFile?: CMSFile;
    relatedFile?: CMSFile;
    openLinkInNewWindow?: boolean;
    exclude?: boolean;
    active?: boolean;
    createdHref?: URL;
    state?: State;
}

export class Presentations implements Objectifiable, ContainsDownloadableFiles {
    private _date?: CMSDate;
    private _title?: string;
    private _href?: URL;
    private _time?: CMSTime;
    private _body?: string;
    private _tags: Array<string> = [];
    private _relatedDoc?: CMSFile;
    private _urlOverride?: UrlOverride;
    private _audioFile?: CMSFile;
    private _videoFile?: CMSFile;
    private _relatedFile?: CMSFile;
    private _openLinkInNewWindow: boolean = false;
    private _exclude: boolean = false;
    private _active: boolean = true;
    private _createdHref?: URL;
    private _state: State = State.Uninitialized;
    constructor(input: PresentationsInput) {

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

    if (input.body) {
        this._body = input.body;
    }

    if (input.tags) {
        this._tags = input.tags;
    }

    if (input.relatedDoc) {
        this._relatedDoc = input.relatedDoc;
    }

    if (input.urlOverride) {
        this._urlOverride = input.urlOverride;
    }

    if (input.audioFile) {
        this._audioFile = input.audioFile;
    }

    if (input.videoFile) {
        this._videoFile = input.videoFile;
    }

    if (input.relatedFile) {
        this._relatedFile = input.relatedFile;
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

public get urlOverride(): UrlOverride | undefined {
    return this._urlOverride;
}

public set urlOverride(override: UrlOverride | undefined) {
    this._urlOverride = override;
}

public get audioFile(): CMSFile | undefined {
    return this._audioFile;
}

public set audioFile(override: CMSFile | undefined) {
    this._audioFile = override;
}

public get videoFile(): CMSFile | undefined {
    return this._videoFile;
}

public set videoFile(override: CMSFile | undefined) {
    this._videoFile = override;
}

public get relatedFile(): CMSFile | undefined {
    return this._relatedFile;
}

public set relatedFile(override: CMSFile | undefined) {
    this._relatedFile = override;
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

public set createdHref(u: URL | undefined) {
    this._createdHref = u;
}

public get createdHref(): URL | undefined {
    return this._createdHref;
}

public set state(s: State) {
    this._state = s;
}

public get state(): State {
    return this._state;
}

objectify() {
    const obj: Record<string, any> = {};

    if (this._time) {
        obj.time = {
            hour: this._time.hour,
            minute: this._time.minute,
            meridiem: this._time.meridiem,
        };
    }

    if (this._date) {
        obj.date = this._date.to_string();
    }

    if (this._title) {
        obj.title = this._title;
    }

    if (this._body) {
        obj.body = this._body;
    }

    if (this._href) {
        obj.href = this._href;
    }

    if (this._tags) {
        obj.tags = this._tags;
    }

    if (this._relatedDoc) {
        obj.relatedDoc = this._relatedDoc.objectify();
    }

    if (this._urlOverride) {
        if (this._urlOverride instanceof URL) {
            obj.urlOverride = this._urlOverride.toString();
        } else {
            obj.urlOverride = this._urlOverride.objectify();
        }
    }

    if (this._audioFile) {
        obj.audioFile = this._audioFile.objectify();
    }

    if (this._videoFile) {
        obj.videoFile = this._videoFile.objectify();
    }

    if (this._relatedFile) {
        obj.relatedFile = this._relatedFile.objectify();
    }

    obj.exclude = this._exclude;
    obj.openLinkInNewWindow = this._openLinkInNewWindow;
    obj.active = this._active;

    if (this._createdHref) {
        obj.createdHref = this._createdHref.toString();
    }

    obj.state = this._state;

    return obj;
}

public static convertObjectToClass(o: any) {

    const input: PresentationsInput = {};

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

    if (o.urlOverride) {
        if (typeof o.urlOverride === 'string') {
            input.urlOverride = new URL(o.urlOverride);
        } else {
            const override = o.urlOverride;
            input.urlOverride = new CMSFile(override.remotePath, override.customFilename, override.localPath);
        }
        }

    if (o.audioFile) {
        let localPath, customFilename;
        if (o.audioFile.localPath && o.audioFile.localPath !== '') {
            localPath = o.audioFile.localPath;
        }
        if (o.audioFile.customFilename && o.audioFile.customFilename !== '') {
            customFilename = o.audioFile.customFilename;
        }
        input.audioFile = new CMSFile(o.audioFile.remotePath, customFilename, localPath);
    }

    if (o.videoFile) {
        let localPath, customFilename;
        if (o.videoFile.localPath && o.videoFile.localPath !== '') {
            localPath = o.videoFile.localPath;
        }
        if (o.videoFile.customFilename && o.videoFile.customFilename !== '') {
            customFilename = o.videoFile.customFilename;
        }
        input.videoFile = new CMSFile(o.videoFile.remotePath, customFilename, localPath);
    }

    if (o.relatedFile) {
        let localPath, customFilename;
        if (o.relatedFile.localPath && o.relatedFile.localPath !== '') {
            localPath = o.relatedFile.localPath;
        }
        if (o.relatedFile.customFilename && o.relatedFile.customFilename !== '') {
            customFilename = o.relatedFile.customFilename;
        }
        input.relatedFile = new CMSFile(o.relatedFile.remotePath, customFilename, localPath);
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

    return new Presentations(input);

}

getDownloadables(): Array<CMSFile> {

    const downloadables: Array<CMSFile> = [];

    if (this._urlOverride instanceof CMSFile) {
        downloadables.push(this._urlOverride);
    }

    if (this._relatedDoc) {
        downloadables.push(this._relatedDoc);
    }

    if (this._audioFile) {
        downloadables.push(this._audioFile);
    }

    if (this._videoFile) {
        downloadables.push(this._videoFile);
    }

    if (this._relatedFile) {
        downloadables.push(this._relatedFile);
    }

    return downloadables;

}

}