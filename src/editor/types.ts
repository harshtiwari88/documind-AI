export type Align = "left" | "center" | "right" | "justify";
export type FontKey = "helv" | "times" | "cour" | "symbol" | "zapf" | string;
export type ShapeKind = "rect" | "ell" | "line" | "arrow";
export type Tool = "select" | "text" | "edit" | "erase" | "hl" | "ul" | "st" | "draw" | "shape" | "note";

export interface Line {
  [key: string]: any;
  str: string;
  text?: string;
  x: number;
  y: number;
  base: number;
  w: number;
  h: number;
  s: number;
  size?: number;
  fam?: string;
  name?: string;
  color?: string;
  bold: boolean;
  italic: boolean;
  font: FontKey;
}

export interface Block {
  [key: string]: any;
  id: string;
  kind?: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  lines: Line[];
}

export interface TextAnn {
  [key: string]: any;
  id: number;
  t: "text";
  kind?: string;
  ref?: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  font?: FontKey;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: Align;
  nowrap?: boolean;
  cover?: { x: number; y: number; w: number; h: number; color: string };
  role?: string;
}

export interface Ann {
  [key: string]: any;
  id: number;
  t: string;
  kind?: string;
  k?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  url?: string;
  color?: string;
  stroke?: string;
  fill?: string | null;
  sw?: number;
  size?: number;
  font?: FontKey;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: Align;
  rotation?: number;
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
  pts?: [number, number][];
  ref?: string;
  base?: number;
  sig?: boolean;
  nowrap?: boolean;
  cover?: { x: number; y: number; w: number; h: number; color: string };
  key?: string;
}

export interface PageState {
  [key: string]: any;
  id: number;
  d: number;
  i: number;
  rot: number;
  w: number;
  h: number;
  a: Ann[];
}

export interface DocOpts {
  [key: string]: any;
  wm: string;
  pn: string;
  hd: string;
  ft: string;
  bg: string;
}

export interface Fmt {
  [key: string]: any;
  font: FontKey;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: Align;
  stroke: string;
  fill: string | null;
  sw: number;
  shape: ShapeKind;
  hl: string;
  lineHeight?: number;
  letterSpacing?: number;
  rotation?: number;
  opacity?: number;
}

export interface ImgData {
  [key: string]: any;
  id?: string;
  bytes: Uint8Array;
  mime: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface Analysis {
  lines: Line[];
  blocks: Block[];
  median: number;
  [key: string]: unknown;
}
