import { Select } from './Select';
import { Objectifiable } from './Objectifiable';
import { CMSFile } from './CMSFile';
import { ContainsDownloadableFiles } from './Downloadable';
import { State } from './State';
import { stringToEnumValue } from '../helpers/Enum';

const MAX_COUNT = 250;

export type PersonInput = {
    href?: URL | string;
    category?: Select;
    firstName?: string;
    lastName?: string;
    suffix?: string;
    title?: string;
    body?: string;
    highlights?: string;
    tags?: Array<string>;
    active?: boolean;
    relatedImg?: CMSFile;
    createdHref?: URL;
    state?: State;
}

export class Persons implements Objectifiable, ContainsDownloadableFiles {
    private _href?: URL;
    private _category: Select = new Select('', '');
    private _firstName?: string;
    private _lastName?: string;
    private _suffix?: string;
    private _title?: string;
    private _body?: string;
    private _highlights?: string;
    private _tags: Array<string> = [];
    private _active: boolean = true;
    private _relatedImg?: CMSFile;
    private _createdHref?: URL;
    private _state: State = State.Uninitialized;
    per: HTMLImageElement[] = [];

    constructor(input: PersonInput) {

    if (input.href) {
        this._href = typeof input.href === 'string' ? new URL(input.href) : input.href;
    }

    if (input.title) {
        if (input.title.length >= MAX_COUNT) {
            throw new Error("Title cannot be longer than 250 characters.");
        }
        this._title = input.title;
    }

    if (input.category) {
        this._category = new Select(input.category.value, input.category.text);
    }

    if (input.firstName) {
        this._firstName = input.firstName;
    }

    if (input.lastName) {
        this._lastName = input.lastName;
    }

    if (input.body) {
        this._body = input.body;
    }

    if (input.highlights) {
        this._highlights = input.highlights;
    }

    if (input.tags) {
        this._tags = input.tags;
    }

    if (input.relatedImg) {
        this._relatedImg = input.relatedImg;
    }

    if (input.active != null) {
        this._active = input.active;
    }

    if (input.createdHref != null) {
        this._createdHref = input.createdHref;
    }

    this._state = input.state != null ? input.state : State.Uninitialized;

    }

public get href(): URL | undefined {
    return this._href;
}

public get title(): string | undefined {
    return this._title;
}

public set title(str: string | undefined) {
    this._title = str;
}

public set category(c: Select) {
  this._category = c;
}

public get category() {
  return this._category;
}

public get firstName(): string | undefined {
    return this._firstName;
}

public set firstName(firstName: string | undefined) {
    this._firstName = firstName;
}

public get lastName(): string | undefined {
    return this._lastName;
}

public set lastName(lastName: string | undefined) {
    this._lastName = lastName;
}

public get suffix(): string | undefined {
    return this._suffix;
}

public set suffix(suffix: string | undefined) {
    this._suffix = suffix;
}

public get body(): string | undefined {
    return this._body;
}

public set body(body: string | undefined) {
    this._body = body;
}

public get highlights(): string | undefined {
    return this._highlights;
}

public set highlights(highlights: string | undefined) {
    this._highlights = highlights;
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

public set active(b: boolean) {
    this._active = b;
}

public get active(): boolean {
    return this._active;
}

public get relatedImg(): CMSFile | undefined {
    return this._relatedImg;
}

public set relatedImg(file: CMSFile | undefined) {
    this._relatedImg = file;
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

 objectify() {
    const obj: Record<string, any> = {};

    if (this._title) {
        obj.title = this._title;
    }

    if (this._href) {
        obj.href = this._href;
    }

    obj.category = this._category.objectify();

    if (this._firstName) {
        obj.firstName = this._firstName;
    }

    if (this._lastName) {
        obj.lastName = this._lastName;
    }

    if (this._suffix) {
        obj.suffix = this._suffix;
    }

    if (this._body) {
        obj.body = this._body;
    }

    if (this._highlights) {
        obj.highlights = this._highlights;
    }

    if (this._tags) {
        obj.tags = this._tags;
    }

    obj.active = this._active;

    if (this._relatedImg) {
        obj.relatedImg = this._relatedImg.objectify();
    }

    if (this._createdHref) {
        obj.createdHref = this._createdHref.toString();
    }

    obj.state = this._state;

    return obj;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
public static convertObjectToClass(o: any) {

    const input: PersonInput = {};

    if (o.title) {
      input.title = o.title;
    }

    if (o.href) {
      input.href = new URL(o.href);
    }

    if (o.category) {
      input.category = new Select(o.category.value, o.category.text);
    }

    if (o.relatedImg) {
        let localPath, customFilename;
        if (o.relatedImg.localPath && o.relatedImg.localPath !== '') {
          localPath = o.relatedImg.localPath;
        }
        if (o.relatedImg.customFilename && o.relatedImg.customFilename !== '') {
          customFilename = o.relatedImg.customFilename;
        }
        input.relatedImg = new CMSFile(o.relatedImg.remotePath, customFilename, localPath);
      }

    if (o.firstName) {
        input.firstName = o.firstName;
      }

      if (o.lastName) {
          input.lastName = o.lastName;
        }

        if (o.suffix) {
            input.suffix = o.suffix;
          }
  

    if (o.body) {
      input.body = o.body;
    }

    if (o.highlights) {
      input.highlights = o.highlights;
    }

    if (o.tags) {
      input.tags = o.tags;
    }

    if (o.active !== null && o.active !== undefined) {
      input.active = o.active;
    }

    if (o.createdHref !== null && o.createdHref !== undefined) {
      input.createdHref = new URL(o.createdHref);
    }

    if (o.state !== null && o.state !== undefined) {
      input.state = stringToEnumValue(State, o.state);
    }

    return new Persons(input);

}

getDownloadables(): Array<CMSFile> {

    const downloadables: Array<CMSFile> = [];
    if (this._relatedImg) {
            downloadables.push(this._relatedImg);
    }

    return downloadables;

}

}