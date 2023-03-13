import {CallbackPayload, Signature} from '@wharfkit/session'

export function extractSignaturesFromCallback(payload: CallbackPayload): Signature[] {
    const signatures: Signature[] = []

    if (payload.sig) {
        signatures.push(Signature.from(payload.sig))
    }

    let index = 0

    while (true) {
        const sig = payload[`sig${index}`]

        if (!sig) {
            break
        }

        signatures.push(Signature.from(sig))

        index++
    }

    return signatures
}
