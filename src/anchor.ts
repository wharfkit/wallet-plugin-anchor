import {
    Bytes,
    Name,
    PublicKey,
    SigningRequest,
    Struct,
    TimePointSec,
    UInt32,
    UInt64,
} from '@wharfkit/session'

import {v4 as uuid} from 'uuid'
import zlib from 'pako'

@Struct.type('buoy_message')
export class BuoyMessage extends Struct {
    @Struct.field('public_key') from!: PublicKey
    @Struct.field('uint64') nonce!: UInt64
    @Struct.field('bytes') ciphertext!: Bytes
    @Struct.field('uint32') checksum!: UInt32
}

@Struct.type('buoy_session')
export class BuoySession extends Struct {
    @Struct.field('name') session_name!: Name
    @Struct.field('public_key') request_key!: PublicKey
    @Struct.field('string', {extension: true}) user_agent?: string
}

@Struct.type('buoy_info')
export class BuoyInfo extends Struct {
    @Struct.field('time_point_sec') expiration!: TimePointSec
}

export function getUserAgent() {
    // TODO: Add version number to user agent string
    let agent = `@wharfkit/wallet-plugin-anchor `
    if (typeof navigator !== 'undefined') {
        agent += navigator.userAgent
    }
    return agent
}

export async function createIdentityRequest(context, options) {
    // const privateKey = PrivateKey.generate('K1')
    // const requestKey = privateKey.toPublic()
    // const createInfo = BuoySession.from({
    //     session_name: options.appName,
    //     request_key: requestKey,
    //     user_agent: getUserAgent(),
    // })

    // const {request, callback} = await this.createRequest({
    //     identity: {permission: args.requestPermission, scope: args.scope},
    //     info: args.info,
    // })

    let request: SigningRequest
    const args = {identity: {permission: options.permissionLevel, scope: options.appName}}
    if (options.chain || options.chains.length === 1) {
        // const c = options.chain || options.chains[0]
        request = await SigningRequest.create(
            {
                ...args,
                chainId: options.chain?.id,
                broadcast: false,
            },
            {zlib}
        )
    } else {
        // multi-chain request
        request = await SigningRequest.create(
            {
                ...args,
                chainId: null,
                chainIds: options.chains.map((c) => c.id),
                broadcast: false,
            },
            {zlib}
        )
    }
    const callback = {
        service: `https://cb.anchor.link`,
        channel: uuid(),
    }
    request.setCallback(`${callback.service}/${callback.channel}`, true)
    return {
        callback,
        request,
    }
}
