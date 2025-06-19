/*
  Used for saving how the CMS encodes select elements
*/

export type SelectObject = {
  value: string;
  text: string;
}

export class Select {
  private _value: string;
  private _text: string;
  constructor(value: string, text: string){
    this._value = value;
    this._text = text;
  }
  public get value(): string {
    return this._value;
  }
  public get text(): string {
    return this._text;
  }
  objectify(){
    return {
      value: this._value,
      text: this._text,
    }
  }
}