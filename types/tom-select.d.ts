declare module 'tom-select' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default class TomSelect {
    constructor(el: HTMLElement | string, options?: Record<string, unknown>);
    getValue(): string | string[];
    setValue(value: string | string[], silent?: boolean): void;
    clear(silent?: boolean): void;
    destroy(): void;
  }
}
