export type Align = "left" | "center" | "right" | "justify";
export type FontKey = "helv" | "times" | "cour" | "symbol" | "zapf" | string;
export type ShapeKind = "rect" | "ell" | "line" | "arrow";
export type Tool = "select" | "text" | "edit" | "erase" | "hl" | "ul" | "st" | "draw" | "shape" | "note";
export interface Line { [key: string]: any; str: string; text?: string; x: number; y?: number; base: number; w: number; s: number; size?: number; fam?: string; name?: string; color?: string; bold?: boolean; italic?: boolean; }
export interface Block { [key: string]: any; id: string; kind?: string; text: string; x: number; y: number; w: number; h: number; lines?: Line[]; }
export interface TextAnn { [key: string]: any; id: number; t?: string; kind?: string; ref?: string; text: string; x: number; y: number; w?: number; h?: number; font?: FontKey; size?: number; color?: string; bold?: boolean; italic?: boolean; underline?: boolean; align?: Align; }
export interface Ann { [key: string]: any; id: number; t?: string; kind?: string; x?: number; y?: number; w?: number; h?: number; x1?: number; y1?: number; x2?: number; y2?: number; text?: string; color?: string; stroke?: string; fill?: string | null; sw?: number; size?: number; font?: FontKey; bold?: boolean; italic?: boolean; underline?: boolean; align?: Align; pts?: [number, number][]; ref?: string; base?: number; sig?: boolean; cover?: { x: number; y: number; w: number; h: number; color: string }; blue?: number; red?: number; green?: number; }
export interface PageState { [key: string]: any; id: number; d: number; i: number; rot: number; w: number; h: number; a: Ann[]; }
export interface DocOpts { [key: string]: any; wm: string; pn: string; hd: string; ft: string; bg: string; }
export interface Fmt { [key: string]: any; font: FontKey; size: number; color: string; bold: boolean; italic: boolean; underline: boolean; align: Align; stroke: string; fill: string | null; sw: number; shape: ShapeKind; hl: string; }
export interface ImgData { [key: string]: any; id?: string; bytes?: any; mime: string; dataUrl?: string; width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; }
export interface Analysis { lines: Line[]; blocks: Block[]; [key: string]: unknown; }
