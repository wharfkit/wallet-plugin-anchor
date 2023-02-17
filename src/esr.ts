import {CallbackPayload} from 'eosio-signing-request'
import {Signature} from '@greymass/eosio'

export function extractSignaturesFromCallback(payload: CallbackPayload): Signature[] {
    const signatures: Signature[] = []
    while (payload[`sig${signatures.length}`]) {
        signatures.push(Signature.from(payload[`sig${signatures.length}`]!))
    }

    return signatures
}
