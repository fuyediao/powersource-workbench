export interface IconKeywords {
  name: string;
  keywords: string[];
}

export interface KeywordsCategory {
  [categoryName: string]: IconKeywords[];
}


export type KeywordsData = KeywordsCategory;


declare module "@blocksuite/icons/keywords/en.json" {
  const value: KeywordsData;
  export default value;
}

declare module "@blocksuite/icons/keywords/*.json" {
  const value: KeywordsData;
  export default value;
}

declare module "./keywords/*.json" {
  const value: KeywordsData;
  export default value;
}

declare module "./dist/keywords/*.json" {
  const value: KeywordsData;
  export default value;
}
