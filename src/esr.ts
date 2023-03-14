import {CallbackPayload, Signature} from '@wharfkit/session'

export function extractSignaturesFromCallback(payload: CallbackPayload): Signature[] {
    const signatures: Signature[] = []

    let index = 0
    let sig: string | undefined = payload.sig

    while (sig) {
        signatures.push(Signature.from(sig))

        sig = payload[`sig${index}`]

        index++
    }

    return signatures
}

export function isCallback(object: any): object is CallbackPayload {
    return 'tx' in object
}
