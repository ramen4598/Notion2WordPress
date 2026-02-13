export class PageException extends Error {
    constructor(message: string, cause?: unknown) {
        const causeMsg = cause instanceof Error ? cause.message : String(cause);
        super(`${message} ${cause ? `| Cause: ${causeMsg}` : ''}`);
        this.name = 'PageException';
    }
}