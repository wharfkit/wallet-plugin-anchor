import {WalletPluginPrivateKey} from '@wharfkit/wallet-plugin-privatekey'

import {
    AbstractWalletPlugin,
    ChainDefinition,
    Checksum256,
    LoginContext,
    PermissionLevel,
    PrivateKey,
    ResolvedSigningRequest,
    SigningRequest,
    TransactContext,
    Transaction,
    WalletPluginConfig,
    WalletPluginData,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'
import {mockChainDefinition, mockPermissionLevel, mockPrivateKey} from './mock-config'
import {makeMockAction} from './mock-transfer'
import {WalletPluginAnchor} from 'src/index'

export function makeWallet() {
    return new WalletPluginPrivateKey(PrivateKey.from(mockPrivateKey))
}

export function makeAnchorWallet() {
    return new WalletPluginAnchor({buoyUrl: 'https://cb.test.com'})
}

export class MockWalletPluginConfigs extends AbstractWalletPlugin {
    readonly metadata = WalletPluginMetadata.from({
        name: 'Mock Wallet Plugin',
        description: 'A mock wallet plugin for testing chain selection',
    })
    testModify = false
    config: WalletPluginConfig
    constructor(config?: WalletPluginConfig, initialData: WalletPluginData = {}) {
        super()
        if (config) {
            this.config = config
        } else {
            this.config = {
                requiresChainSelect: true,
                requiresPermissionSelect: false,
            }
        }
        this.data = initialData
    }
    get id() {
        return 'MockWalletPluginConfigs'
    }
    async login(context: LoginContext) {
        // Return the chain and permission level for this fake wallet
        return {
            chain: context.chain ? context.chain.id : ChainDefinition.from(mockChainDefinition).id,
            permissionLevel: context.permissionLevel || PermissionLevel.from(mockPermissionLevel),
        }
    }
    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        if (context.storage) {
            context.storage.write('testModify', this.data.testModify)
        }
        // If the `testModify` flag is enabled, modify the transaction for testing purposes
        if (this.data.testModify) {
            const request = await SigningRequest.create(
                {action: makeMockAction('modified transaction')},
                context.esrOptions
            )
            const modifiedResolved = await context.resolve(request)
            const transaction = Transaction.from(modifiedResolved.transaction)
            const digest = transaction.signingDigest(Checksum256.from(context.chain.id))
            const privateKey = PrivateKey.from(this.data.privateKey)
            const signature = privateKey.signDigest(digest)
            return {
                resolved: modifiedResolved,
                signatures: [signature],
            }
        }
        // Otherwise sign what was returned
        const transaction = Transaction.from(resolved.transaction)
        const digest = transaction.signingDigest(Checksum256.from(context.chain.id))
        const privateKey = PrivateKey.from(this.data.privateKey)
        const signature = privateKey.signDigest(digest)
        return {
            signatures: [signature],
        }
    }
}
