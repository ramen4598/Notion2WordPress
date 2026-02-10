export class ImageException extends Error {
    constructor(message: string, cause?: unknown) {
        const causeMsg = cause instanceof Error ? cause.message : String(cause);
        super(`${message} ${cause ? `| Cause: ${causeMsg}` : ''}`);
        this.name = 'ImageException';
    }
}

export class ImageProcessException extends ImageException {
    constructor(imageId: string, cause?: unknown) {
        super(`Failed to process image with ID: ${imageId}`, cause);
        this.name = 'ImageProcessException';
    }
}

export class ImageDownloadException extends ImageException {
    constructor(imageUrl: string, cause?: unknown) {
        super(`Failed to download image from URL: ${imageUrl}`, cause);
        this.name = 'ImageDownloadException';
    }
}
