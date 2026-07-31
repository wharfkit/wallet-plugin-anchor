export class AnchorRequestCancelledError extends Error {
    constructor(message = 'The request was cancelled.') {
        super(message)
        this.name = 'AnchorRequestCancelledError'
    }
}
