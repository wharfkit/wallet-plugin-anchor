import {ReceiveOptions} from '@greymass/buoy'
import {AES_CBC} from '@greymass/miniaes'
import {
    Bytes,
    CallbackType,
    ChainDefinition,
    Checksum256,
    Checksum512,
    LoginContext,
    PrivateKey,
    PublicKey,
    ResolvedSigningRequest,
    Serializer,
    SigningRequest,
    UInt64,
} from '@wharfkit/session'

import {uuid} from './utils'

import {BuoySession} from './buoy-types'

import {SealedMessage} from './anchor-types'

interface IdentityRequestResponse {
    callback
    request: SigningRequest
    requestKey: PublicKey
    privateKey: PrivateKey
}

/**
 * createIdentityRequest
 *
 * @param context LoginContext
 * @returns
 */
export async function createIdentityRequest(
    context: LoginContext,
    buoyUrl: string
): Promise<IdentityRequestResponse> {
    // Create a new private key and public key to act as the request key
    const privateKey = PrivateKey.generate('K1')
    const requestKey = privateKey.toPublic()

    // Create a new BuoySession struct to be used as the info field
    const createInfo = BuoySession.from({
        session_name: 'Anchor Session',
        request_key: requestKey,
        user_agent: getUserAgent(),
    })

    // Determine based on the options whether this is a multichain request
    const isMultiChain = !(context.chain || context.chains.length === 1)

    // Create the callback
    const callbackChannel = prepareCallbackChannel(buoyUrl)

    // Create the request
    const request = SigningRequest.identity(
        {
            callback: prepareCallback(callbackChannel),
            scope: String(context.appName),
            chainId: isMultiChain ? null : context.chain?.id,
            chainIds: isMultiChain ? context.chains.map((c) => c.id) : undefined,
            info: {
                link: createInfo,
                scope: String(context.appName),
            },
        },
        context.esrOptions
    )

    // Return the request and the callback data
    return {
        callback: callbackChannel,
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

export function setTransactionCallback(resolved: ResolvedSigningRequest, buoyUrl) {
    const callback = prepareCallbackChannel(buoyUrl)

    resolved.request.setCallback(`${callback.service}/${callback.channel}`, true)

    return callback
}

export function getUserAgent(): string {
    const version = '__ver'
    let agent = `@wharfkit/wallet-plugin-anchor ${version}`
    if (typeof navigator !== 'undefined') {
        agent += ' ' + navigator.userAgent
    }
    return agent
}

export function prepareCallback(callbackChannel: ReceiveOptions): CallbackType {
    const {service, channel} = callbackChannel
    return {
        url: `${service}/${channel}`,
        background: true,
    }
}

function prepareCallbackChannel(buoyUrl): ReceiveOptions {
    return {
        service: buoyUrl,
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

export async function verifyLoginCallbackResponse(callbackResponse, context: LoginContext) {
    if (!callbackResponse.sig || callbackResponse.sig.length === 0) {
        throw new Error('Invalid response, must have at least one signature')
    }

    let chain: ChainDefinition
    if (!context.chain && context.chains.length > 1) {
        if (!callbackResponse.cid) {
            throw new Error('Multi chain response payload must specify resolved chain id (cid)')
        }
    } else {
        chain = context.chain || context.chains[0]

        if (callbackResponse.cid && String(chain.id) !== callbackResponse.cid) {
            throw new Error('Got response for wrong chain id')
        }
    }
}
