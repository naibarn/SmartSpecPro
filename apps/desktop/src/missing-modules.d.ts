/**
 * Type declarations for modules not yet installed.
 * Remove individual declarations as the actual packages are added.
 */

declare module '@tauri-apps/plugin-dialog' {
  export function open(options?: any): Promise<string | string[] | null>;
  export function save(options?: any): Promise<string | null>;
  export function message(msg: string, options?: any): Promise<void>;
  export function ask(msg: string, options?: any): Promise<boolean>;
  export function confirm(msg: string, options?: any): Promise<boolean>;
}

declare module '@tauri-apps/plugin-fs' {
  export function readTextFile(path: string): Promise<string>;
  export function writeTextFile(path: string, contents: string): Promise<void>;
  export function readDir(path: string, options?: any): Promise<any[]>;
  export function exists(path: string): Promise<boolean>;
  export function mkdir(path: string, options?: any): Promise<void>;
  export function remove(path: string, options?: any): Promise<void>;
  export function rename(from: string, to: string): Promise<void>;
  export function copyFile(from: string, to: string): Promise<void>;
  export class BaseDirectory {
    static AppData: number;
    static Home: number;
    static Desktop: number;
  }
}

declare module '@tauri-apps/api/fs' {
  export function readTextFile(path: string, options?: any): Promise<string>;
  export function writeTextFile(path: string, contents: string, options?: any): Promise<void>;
  export function writeFile(path: string, contents: any, options?: any): Promise<void>;
  export function readDir(path: string, options?: any): Promise<any[]>;
  export function readBinaryFile(path: string, options?: any): Promise<Uint8Array>;
  export function exists(path: string, options?: any): Promise<boolean>;
  export function createDir(path: string, options?: any): Promise<void>;
  export function removeFile(path: string, options?: any): Promise<void>;
  export class BaseDirectory {
    static AppData: number;
    static Home: number;
  }
}

declare module '@tauri-apps/api/tauri' {
  export function invoke<T = any>(cmd: string, args?: Record<string, any>): Promise<T>;
}

declare module 'react-hot-toast' {
  const toast: {
    (message: string): string;
    success(message: string): string;
    error(message: string): string;
    loading(message: string): string;
    dismiss(id?: string): void;
  };
  export default toast;
}

declare module 'jszip' {
  class JSZip {
    file(name: string): { async(type: string): Promise<any> } | null;
    file(name: string, data: any, options?: any): this;
    folder(name: string): JSZip | null;
    forEach(callback: (relativePath: any, file: any) => void): void;
    loadAsync(data: any): Promise<JSZip>;
    generateAsync(options: any): Promise<any>;
  }
  export default JSZip;
}
