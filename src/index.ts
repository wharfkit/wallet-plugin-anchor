import {receive, send} from '@greymass/buoy'
import {
    AbstractWalletPlugin,
    CallbackPayload,
    Cancelable,
    Canceled,
    Checksum256,
    LoginContext,
    PermissionLevel,
    PrivateKey,
    PromptResponse,
    PublicKey,
    ResolvedSigningRequest,
    Serializer,
    SigningRequest,
    TransactContext,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'

import WebSocket from 'isomorphic-ws'

import {
    createIdentityRequest,
    sealMessage,
    setTransactionCallback,
    verifyLoginCallbackResponse,
} from './anchor'
import {LinkInfo} from './anchor-types'

import {extractSignaturesFromCallback} from './esr'

interface WalletPluginOptions {
    buoyUrl?: string
    buoyWs?: WebSocket
}
export class WalletPluginAnchor extends AbstractWalletPlugin {
    chain: Checksum256 | undefined
    auth: PermissionLevel | undefined
    requestKey: PublicKey | undefined
    privateKey: PrivateKey | undefined
    signerKey: PublicKey | undefined
    channelUrl: string | undefined
    channelName: string | undefined
    buoyUrl: string
    buoyWs: WebSocket | undefined

    constructor(options?: WalletPluginOptions) {
        super()

        this.buoyUrl = options?.buoyUrl || 'https://cb.anchor.link'
        this.buoyWs = options?.buoyWs
    }

    public get id(): string {
        return 'anchor'
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
            this.handleLogin(context)
                .then((response) => {
                    resolve(response)
                })
                .catch((error) => {
                    reject(error)
                })
        })
    }

    async handleLogin(context: LoginContext): Promise<WalletPluginLoginResponse> {
        context.ui?.status('Preparing request for Anchor...')

        // Create the identity request to be presented to the user
        const {callback, request, requestKey, privateKey} = await createIdentityRequest(
            context,
            this.buoyUrl
        )
        // Tell Wharf we need to prompt the user with a QR code and a button
        const promptResonse = context.ui?.prompt({
            title: 'Login with Anchor',
            body: 'Scan the QR-code with Anchor on another device or use the button to open it here.',
            elements: [
                {
                    type: 'qr',
                    data: String(request),
                },
                {
                    type: 'link',
                    label: 'Open Anchor',
                    data: {
                        href: String(request),
                        label: 'Open Anchor',
                    },
                },
            ],
        })

        promptResonse.catch((error) => {
            // Throw if what we caught was a cancelation
            if (error instanceof Canceled) {
                throw error
            }
        })

        // Await a promise race to wait for either the wallet response or the cancel
        const callbackResponse: CallbackPayload = await waitForCallback(callback, this.buoyWs)

        if (
            callbackResponse.link_ch &&
            callbackResponse.link_key &&
            callbackResponse.link_name &&
            callbackResponse.cid
        ) {
            verifyLoginCallbackResponse(callbackResponse, context)

            this.data.requestKey = requestKey
            this.data.privateKey = privateKey
            this.data.signerKey =
                callbackResponse.link_key && PublicKey.from(callbackResponse.link_key)
            this.data.channelUrl = callbackResponse.link_ch
            this.data.channelName = callbackResponse.link_name

            return {
                chain: Checksum256.from(callbackResponse.cid),
                permissionLevel: PermissionLevel.from({
                    actor: callbackResponse.sa,
                    permission: callbackResponse.sp,
                }),
            }
        } else {
            throw new Error(
                'Invalid response from Anchor, must contain link_ch, link_key, link_name and cid flags.'
            )
        }
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
        return this.handleSignatureRequest(resolved, context)
    }

    private async handleSignatureRequest(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        if (!context.ui) {
            throw new Error('No UI available')
        }
        context.ui.status('Preparing request for Anchor...')

        // Set expiration time frames for the request
        const expiration = resolved.transaction.expiration.toDate()
        const now = new Date()
        const expiresIn = Math.floor(expiration.getTime() - now.getTime())

        // Tell Wharf we need to prompt the user with a QR code and a button
        const promptPromise: Cancelable<PromptResponse> = context.ui.prompt({
            title: 'Sign',
            body: `Please open the Anchor Wallet on "${this.data.channelName}" to review and sign the transaction.`,
            elements: [
                {
                    type: 'countdown',
                    data: expiration.toISOString(),
                },
                {
                    type: 'link',
                    label: 'Sign manually or with another device',
                    data: {
                        href: String(resolved.request),
                        label: 'Trigger Manually',
                    },
                },
            ],
        })

        // Create a timer to test the external cancelation of the prompt, if defined
        const timer = setTimeout(() => {
            if (!context.ui) {
                throw new Error('No UI defined')
            }
            promptPromise.cancel('The request expired, please try again.')
        }, expiresIn)

        // Clear the timeout if the UI throws (which generally means it closed)
        promptPromise.catch(() => clearTimeout(timer))

        // Set the expiration on the request LinkInfo
        resolved.request.setInfoKey(
            'link',
            LinkInfo.from({
                expiration,
            })
        )

        // Assemble and wait for the callback from the wallet
        const callback = setTransactionCallback(resolved, this.buoyUrl)
        const callbackPromise = waitForCallback(callback, this.buoyWs)

        // Assemble and send the payload to the wallet
        const service = new URL(this.data.channelUrl).origin
        const channel = new URL(this.data.channelUrl).pathname.substring(1)
        const sealedMessage = sealMessage(
            resolved.request.encode(true, false),
            PrivateKey.from(this.data.privateKey),
            PublicKey.from(this.data.signerKey)
        )

        send(Serializer.encode({object: sealedMessage}).array, {
            service,
            channel,
        })

        // Wait for either the callback or the prompt to resolve
        const callbackResponse = await Promise.race([callbackPromise, promptPromise]).finally(
            () => {
                // Clear the automatic timeout once the race resolves
                clearTimeout(timer)
            }
        )

        if (isCallback(callbackResponse)) {
            // If the callback was resolved, create a new request from the response
            const resolvedRequest = await ResolvedSigningRequest.fromPayload(
                callbackResponse,
                context.esrOptions
            )

            const newRequest = await SigningRequest.create(
                {
                    transaction: resolvedRequest.transaction,
                },
                context.esrOptions
            )

            // Return the new request and the signatures from the wallet
            return {
                signatures: extractSignaturesFromCallback(callbackResponse),
                request: newRequest,
            }
        }

        // This shouldn't ever trigger, but just in case
        throw new Error('The request was not completed.')
    }
}

async function waitForCallback(callbackArgs, buoyWs): Promise<CallbackPayload> {
    // Use the buoy-client to create a promise and wait for a response to the identity request
    const callbackResponse = await receive({...callbackArgs, WebSocket: buoyWs || WebSocket})

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

    if (payload.sa === undefined || payload.sp === undefined || payload.cid === undefined) {
        throw new Error('The request was cancelled from Anchor.')
    }

    return payload
}

function isCallback(object: any): object is CallbackPayload {
    return 'tx' in object
}
