export interface Downloadable {
  localPath: string;
  remotePath: URL;
  customFilename: string;
}

export interface ContainsDownloadableFiles {
  getDownloadables(): Array<Downloadable>;
}