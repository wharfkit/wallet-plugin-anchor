import {PrivateKey, PublicKey, Name, Serializer} from '@greymass/eosio'

import {
    Checksum256,
    LoginContext,
    PermissionLevel,
    ResolvedSigningRequest,
    TransactContext,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
    AbstractWalletPlugin,
} from '@wharfkit/session'

import {receive, send} from '@greymass/buoy'
import WebSocket from 'isomorphic-ws'
import {CallbackPayload} from '@wharfkit/session'

import {createIdentityRequest, setTransactionCallback} from './anchor'

import {sealMessage} from './anchor'

import {extractSignaturesFromCallback} from './esr'

interface AnchorSession {
    requestKey: PublicKey
    privateKey: PrivateKey
    chain: Checksum256
    auth: PermissionLevel
    // identifier: Name
    signerKey: PublicKey
    channelUrl: string
    channelName: string
}

export class WalletPluginAnchor extends AbstractWalletPlugin {
    chain: Checksum256 | undefined
    auth: PermissionLevel | undefined
    requestKey: PublicKey | undefined
    privateKey: PrivateKey | undefined
    signerKey: PublicKey | undefined
    channelUrl: string | undefined
    channelName: string | undefined

    public get id(): string {
        return 'anchor'
    }

    public get data() {
        return {
            chain: this.chain,
            auth: this.auth,
            requestKey: this.requestKey,
            privateKey: this.privateKey,
            signerKey: this.signerKey,
            channelUrl: this.channelUrl,
            channelName: this.channelName,
        }
    }

    /**
     * The logic configuration for the wallet plugin.
     */
    readonly config: WalletPluginConfig = {
        // Should the user interface display a chain selector?
        requiresChainSelect: false,
        // Should the user interface display a permission selector?
        requiresPermissionSelect: false,
    }
    /**
     * The metadata for the wallet plugin to be displayed in the user interface.
     */
    readonly metadata: WalletPluginMetadata = {
        name: 'Anchor',
        description: '',
        logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGcgdHJhbnNmb3JtPSJtYXRyaXgoMS40NCwgMCwgMCwgMS40NCwgLTguNTAxOTI1LCAtNTcuMDc0NTcpIiBzdHlsZT0iIj4KICAgIDx0aXRsZT5XaGl0ZTwvdGl0bGU+CiAgICA8Y2lyY2xlIGN4PSI5NC43OTMiIGN5PSIxMjguNTI0IiByPSI4MCIgZmlsbD0iI0ZCRkRGRiIvPgogICAgPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0gOTQuNzk5IDc4LjUyNCBDIDk3LjA5OCA3OC41MjQgOTkuMTk1IDc5LjgzNyAxMDAuMTk4IDgxLjkwNiBMIDEyNC4yMDQgMTMxLjQwNiBMIDEyNC43NDYgMTMyLjUyNCBMIDExMS40MDkgMTMyLjUyNCBMIDEwNy41MyAxMjQuNTI0IEwgODIuMDY5IDEyNC41MjQgTCA3OC4xODkgMTMyLjUyNCBMIDY0Ljg1MyAxMzIuNTI0IEwgNjUuMzk1IDEzMS40MDYgTCA4OS40MDEgODEuOTA2IEMgOTAuNDA0IDc5LjgzNyA5Mi41MDEgNzguNTI0IDk0Ljc5OSA3OC41MjQgWiBNIDg2LjkxOSAxMTQuNTI0IEwgMTAyLjY4IDExNC41MjQgTCA5NC43OTkgOTguMjc0IEwgODYuOTE5IDExNC41MjQgWiBNIDExMi43OTMgMTQ5LjUyNCBMIDEyNC43OTggMTQ5LjUyNCBDIDEyNC40MzcgMTY1LjY3NiAxMTEuMDY3IDE3OC41MjQgOTQuNzk5IDE3OC41MjQgQyA3OC41MzIgMTc4LjUyNCA2NS4xNjIgMTY1LjY3NiA2NC44MDEgMTQ5LjUyNCBMIDc2LjgwNiAxNDkuNTI0IEMgNzcuMDg3IDE1Ni44NzggODEuOTc0IDE2My4xNTUgODguNzkzIDE2NS41MiBMIDg4Ljc5MyAxNDEuNTI0IEMgODguNzkzIDEzOC4yMSA5MS40OCAxMzUuNTI0IDk0Ljc5MyAxMzUuNTI0IEMgOTguMTA3IDEzNS41MjQgMTAwLjc5MyAxMzguMjEgMTAwLjc5MyAxNDEuNTI0IEwgMTAwLjc5MyAxNjUuNTI0IEMgMTA3LjYyIDE2My4xNjIgMTEyLjUxMSAxNTYuODgzIDExMi43OTMgMTQ5LjUyNCBaIiBmaWxsPSIjMzY1MEEyIi8+CiAgPC9nPgo8L3N2Zz4=',
        homepage: 'https://greymass.com/anchor',
        download: 'https://greymass.com/anchor/download',
    }
    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        return new Promise((resolve, reject) => {
            context.ui?.status('Preparing request for Anchor...')

            // Create the identity request to be presented to the user
            createIdentityRequest(context)
                .then(({callback, request, requestKey, privateKey}) => {
                    // Tell Wharf we need to prompt the user with a QR code and a button
                    const {promise} = context.ui?.prompt({
                        title: 'Login with Anchor',
                        body: 'Scan the QR-code with Anchor on another device or use the button to open it here.',
                        elements: [
                            {
                                type: 'qr',
                                data: String(request),
                            },
                            {
                                type: 'button',
                                label: 'Open Anchor',
                                data: String(request),
                            },
                        ],
                    })

                    promise
                        .catch((error) => {
                            reject(error)
                        })
                        .then(() => {
                            reject('User cancelled login')
                        })

                    // Await a promise race to wait for either the wallet response or the cancel
                    waitForCallback(callback)
                        .then((callbackResponse) => {
                            if (
                                callbackResponse.link_ch &&
                                callbackResponse.link_key &&
                                callbackResponse.link_name
                            ) {
                                this.chain = Checksum256.from(callbackResponse.cid!)
                                this.auth = PermissionLevel.from({
                                    actor: callbackResponse.sa,
                                    permission: callbackResponse.sp,
                                })
                                this.requestKey = PublicKey.from(requestKey)
                                this.privateKey = privateKey
                                this.signerKey = PublicKey.from(callbackResponse.link_key!)
                                this.channelUrl = callbackResponse.link_ch
                                this.channelName = callbackResponse.link_name

                                resolve({
                                    chain: Checksum256.from(callbackResponse.cid!),
                                    permissionLevel: PermissionLevel.from({
                                        actor: callbackResponse.sa,
                                        permission: callbackResponse.sp,
                                    }),
                                })
                            }
                        })
                        .catch((error) => {
                            reject(error)
                        })
                })
                .catch((error) => {
                    reject(error)
                })

            // TODO: Response validation
            // https://github.com/greymass/anchor-link/blob/508599dd3fb3420b60ee2fa470bf60ce9ddca1c5/src/link.ts#L379-L429
            // Note: We can skip the resolution/broadcasting, happens in session transact

            // TODO: Optional proof verification
            // https://github.com/greymass/anchor-link/blob/508599dd3fb3420b60ee2fa470bf60ce9ddca1c5/src/link.ts#L513-L552
        })
    }

    /**
     * Performs the wallet logic required to sign a transaction and return the signature.
     *
     * @param chain ChainDefinition
     * @param resolved ResolvedSigningRequest
     * @returns Promise<Signature>
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        return new Promise((resolve, reject) => {
            context.ui?.status('Preparing request for Anchor...')

            // Tell Wharf we need to prompt the user with a QR code and a button
            const {onClose, promise} = context.ui?.prompt({
                title: 'Sign',
                body: 'Please open the Anchor Wallet on "DEVICE" to review and sign the transaction.',
                elements: [
                    {
                        type: 'countdown',
                        data: resolved.transaction.expiration.toDate().toISOString(),
                    },
                    {
                        type: 'button',
                        label: 'Sign manually or with another device',
                        data: String(resolved),
                    },
                ],
            })

            promise
                .catch((error) => {
                    reject(error)
                })
                .then(() => {
                    reject('User cancelled transaction')
                })

            const callback = setTransactionCallback(resolved)

            context.storage
                ?.read('anchor_session')
                .then((sessionDataString) => {
                    if (!sessionDataString) {
                        return reject(new Error('No Anchor session initiated!'))
                    }

                    const sessionData = JSON.parse(sessionDataString)

                    console.log({broadcast: resolved.request.shouldBroadcast()})

                    const sealedMessage = sealMessage(
                        resolved.request.encode(true, false),
                        PrivateKey.from(sessionData.privateKey),
                        PublicKey.from(sessionData.signerKey)
                    )

                    const service = new URL(sessionData.channelUrl).origin
                    const channel = new URL(sessionData.channelUrl).pathname.substring(1)

                    send(Serializer.encode({object: sealedMessage}).array, {
                        service,
                        channel,
                    })

                    waitForCallback(callback)
                        .then((callbackResponse) => {
                            onClose()
                            resolve({
                                signatures: extractSignaturesFromCallback(callbackResponse),
                                request: resolved.request,
                            })
                        })
                        .catch((error) => {
                            reject(error)
                        })
                })
                .catch((error) => {
                    reject(error)
                })
        })
    }
}

async function waitForCallback(callbackArgs): Promise<CallbackPayload> {
    // Use the buoy-client to create a promise and wait for a response to the identity request
    const callbackResponse = await receive({...callbackArgs, WebSocket})

    if (!callbackResponse) {
        // If the promise was rejected, throw an error
        throw new Error(callbackResponse.rejected)
    }

    // If the promise was rejected, throw an error
    if (typeof callbackResponse.rejected === 'string') {
        throw new Error(callbackResponse.rejected)
    }

    // Process the identity request callback payload
    const payload = JSON.parse(callbackResponse) as CallbackPayload

    console.log({payload})
    if (payload.sa === undefined || payload.sp === undefined || payload.cid === undefined) {
        throw new Error('Invalid response from Anchor')
    }

    return payload
}

function redirectToAnchor(prompt = 'open') {
    window.location.href = `anchor://${prompt}`
}
