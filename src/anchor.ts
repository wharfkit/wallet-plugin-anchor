import {ReceiveOptions} from '@greymass/buoy'
import {AES_CBC} from '@greymass/miniaes'
import {Checksum256, Checksum512, PublicKey, Serializer, UInt64, Bytes} from '@greymass/eosio'
import {
    LoginContext,
    PrivateKey,
    SigningRequest,
    WalletPluginLoginOptions,
    ResolvedSigningRequest,
} from '@wharfkit/session'
import zlib from 'pako'
import {v4 as uuid} from 'uuid'

import {BuoySession} from './buoy'
import {logWarn, snakeToCamel} from './utils'

import {SealedMessage} from './anchor-types'

/**
 * createIdentityRequest
 *
 * @param context LoginContext
 * @param options WalletPluginLoginOptions
 * @returns
 */
export async function createIdentityRequest(
    context: LoginContext,
    options: WalletPluginLoginOptions
): Promise<{
    callback
    request: SigningRequest
    requestKey: PublicKey
    privateKey: PrivateKey
}> {
    // TODO:
    // Create a new private key and public key to act as the request key
    const privateKey = PrivateKey.generate('K1')
    const requestKey = privateKey.toPublic()

    // Create a new BuoySession struct to be used as the info field
    const createInfo = BuoySession.from({
        session_name: options.appName,
        request_key: requestKey,
        user_agent: getUserAgent(),
    })

    // Determine based on the options whether this is a multichain request
    const isMultiChain = !(options.chain || options.chains.length === 1)

    // Create the request
    const request = await SigningRequest.create(
        {
            identity: {
                permission: options.permissionLevel,
                scope: options.appName,
            },
            info: {
                link: createInfo,
                scope: options.appName,
            },
            chainId: isMultiChain ? null : options.chain?.id,
            chainIds: isMultiChain ? options.chains.map((c) => c.id) : undefined,
            broadcast: false,
        },
        {zlib}
    )

    // The buoy callback data for this request
    const callback = prepareCallbackChannel()

    // Specify the callback URL on the request itself so the wallet can respond to it
    request.setCallback(`${callback.service}/${callback.channel}`, true)

    // Return the request and the callback data
    return {
        callback,
        request,
        requestKey,
        privateKey,
    }
}

/**
 * prepareTransactionRequest
 *
 * @param resolved ResolvedSigningRequest
 * @returns
 */

export function setTransactionCallback(resolved: ResolvedSigningRequest) {
    const callback = prepareCallbackChannel()

    resolved.request.setCallback(`${callback.service}/${callback.channel}`, true)

    return callback
}

export function getUserAgent(): string {
    // TODO: Pull proper version number to add to user agent string
    const version = '0.0.1'
    let agent = `@wharfkit/wallet-plugin-anchor ${version}`
    if (typeof navigator !== 'undefined') {
        agent += ' ' + navigator.userAgent
    }
    return agent
}

function prepareCallbackChannel(): ReceiveOptions {
    // The buoy callback data for this request
    return {
        service: `https://cb.anchor.link`,
        channel: uuid(),
    }
}

export function sealMessage(
    message: string,
    privateKey: PrivateKey,
    publicKey: PublicKey,
    nonce?: UInt64
): SealedMessage {
    const secret = privateKey.sharedSecret(publicKey)
    if (!nonce) {
        nonce = UInt64.random()
    }
    const key = Checksum512.hash(Serializer.encode({object: nonce}).appending(secret.array))
    const cbc = new AES_CBC(key.array.slice(0, 32), key.array.slice(32, 48))
    const ciphertext = Bytes.from(cbc.encrypt(Bytes.from(message, 'utf8').array))
    const checksumView = new DataView(Checksum256.hash(key.array).array.buffer)
    const checksum = checksumView.getUint32(0, true)
    return SealedMessage.from({
        from: privateKey.toPublic(),
        nonce,
        ciphertext,
        checksum,
    })
}
