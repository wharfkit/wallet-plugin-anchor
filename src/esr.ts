import {CallbackPayload, Signature} from '@wharfkit/session'

export function extractSignaturesFromCallback(payload: CallbackPayload): Signature[] {
    const signatures: Signature[] = []
    while (payload[`sig${signatures.length}`]) {
        signatures.push(Signature.from(payload[`sig${signatures.length}`]!))
    }

    return signatures
}
