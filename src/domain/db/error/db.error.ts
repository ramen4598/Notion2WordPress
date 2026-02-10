export class DBException extends Error {
    constructor(message: string, cause?: unknown) {
        const causeMsg = cause instanceof Error ? cause.message : String(cause);
        super(`${message} ${cause ? `| Cause: ${causeMsg}` : ''}`);
        this.name = 'DBException';
    }
}

export class DBInitializationException extends DBException {
    constructor(message: string, cause?: unknown) {
        super(`Database Initialization Error: ${message}`, cause);
        this.name = 'DBInitializationException';
    }
}