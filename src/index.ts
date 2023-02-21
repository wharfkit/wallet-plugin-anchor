import {PrivateKey, PublicKey, Name, Serializer} from '@greymass/eosio'

import {
    Checksum256,
    LoginContext,
    PermissionLevel,
    ResolvedSigningRequest,
    TransactContext,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
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

let anchorSession: AnchorSession | undefined

export class WalletPluginAnchor implements WalletPlugin {
    public get id(): string {
        return 'anchor'
    }

    public get data() {
        return {}
    }

    public get serialize() {
        return () =>
            ({
                [`${this.id}:${JSON.stringify(this.data)}`]: this.data,
            } as Record<string, any>)
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
                    context.ui?.prompt({
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

                    // Await a promise race to wait for either the wallet response or the cancel
                    waitForCallback(callback)
                        .then((callbackResponse) => {
                            if (
                                callbackResponse.link_ch &&
                                callbackResponse.link_key &&
                                callbackResponse.link_name
                            ) {
                                anchorSession = {
                                    chain: Checksum256.from(callbackResponse.cid!),
                                    auth: PermissionLevel.from({
                                        actor: callbackResponse.sa,
                                        permission: callbackResponse.sp,
                                    }),
                                    requestKey: PublicKey.from(requestKey),
                                    // identifier: context.options.name,
                                    privateKey: PrivateKey.from(privateKey),
                                    signerKey: PublicKey.from(callbackResponse.link_key!),
                                    channelUrl: callbackResponse.link_ch,
                                    channelName: callbackResponse.link_name,
                                }
                            }
                            // Implement storage later
                            //await this.storeSession(session)

                            resolve({
                                chain: Checksum256.from(callbackResponse.cid!),
                                permissionLevel: PermissionLevel.from({
                                    actor: callbackResponse.sa,
                                    permission: callbackResponse.sp,
                                }),
                            })
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

            // TODO: Create session metadata from the response
            // https://github.com/greymass/anchor-link/blob/508599dd3fb3420b60ee2fa470bf60ce9ddca1c5/src/utils.ts#L46-L68

            // TODO: Establish the buoy session - do we need this or is it handled by wharf itself?
            // https://github.com/greymass/anchor-link/blob/master/src/link.ts#L582-L611

            // TODO: The request_key and other metadata needs to be persisted for session restoration
            // https://github.com/greymass/anchor-link/blob/master/src/link.ts#L612

            // Return the chain and permission level to use
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
            context.ui?.prompt({
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

            const callback = setTransactionCallback(resolved)

            if (!anchorSession) {
                return reject(new Error('No Anchor session initiated!'))
            }

            console.log({broadcast: resolved.request.shouldBroadcast()})

            const sealedMessage = sealMessage(
                resolved.request.encode(true, false),
                anchorSession.privateKey,
                anchorSession.signerKey
            )

            console.log({anchorSession})
            console.log({channel: anchorSession.channelUrl})

            const service = new URL(anchorSession.channelUrl).origin
            const channel = new URL(anchorSession.channelUrl).pathname.substring(1)

            console.log({service, channel, sealedMessage})

            send(Serializer.encode({object: sealedMessage}).array, {
                service,
                channel,
            })

            waitForCallback(callback)
                .then((callbackResponse) => {
                    resolve({
                        signatures: extractSignaturesFromCallback(callbackResponse),
                        request: resolved.request,
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
    console.log({callbackArgs})
    const walletResponse = receive({...callbackArgs, WebSocket})

    // TODO: Implement cancel logic from the UI
    const cancel = new Promise<never>(() =>
        //resolve,
        //reject
        {
            // // Code from anchor-link...
            // t.onRequest(request, (reason) => {
            //     if (done) {
            //         // ignore any cancel calls once callbackResponse below has resolved
            //         return
            //     }
            //     const error = typeof reason === 'string' ? new CancelError(reason) : reason
            //     if (t.recoverError && t.recoverError(error, request) === true) {
            //         // transport was able to recover from the error
            //         return
            //     }
            //     walletResponse
            //     callback.cancel()
            //     reject(error)
            // })
        }
    )

    // Await a promise race to wait for either the wallet response or the cancel
    const callbackResponse = await Promise.race([walletResponse, cancel])

    console.log({callbackResponse})

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
