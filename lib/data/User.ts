class User {
  private _username: string;
  private _password: string;
  constructor(username: string, password: string){
    this._username = username;
    this._password = password;
  }
  public get username(): string {
    return this._username;
  }
  public get password(): string {
    return this._password;
  }
}

export default User;