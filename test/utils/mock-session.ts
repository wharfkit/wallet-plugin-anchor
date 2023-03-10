import {
    PermissionLevel,
    Session,
    SessionArgs,
    SessionKit,
    SessionKitOptions,
    SessionOptions,
} from '@wharfkit/session'

import {
    mockChainDefinition,
    mockChainDefinitions,
    mockPermissionLevel,
} from '$test/utils/mock-config'
import {mockFetch} from '$test/utils/mock-fetch'
import {makeAnchorWallet} from '$test/utils/mock-wallet'
import {MockStorage} from './mock-storage'
import {MockUserInterface} from './mock-userinterface'

const wallet = makeAnchorWallet()

export const mockSessionKitOptions: SessionKitOptions = {
    appName: 'unittest',
    chains: mockChainDefinitions,
    fetch: mockFetch, // Required for unit tests
    storage: new MockStorage(),
    ui: new MockUserInterface(),
    walletPlugins: [wallet],
}

export const mockSessionKit = new SessionKit(mockSessionKitOptions)

export const mockSessionArgs: SessionArgs = {
    chain: mockChainDefinition,
    permissionLevel: PermissionLevel.from(mockPermissionLevel),
    walletPlugin: wallet,
}

export const mockSessionOptions: SessionOptions = {
    broadcast: false, // Disable broadcasting by default for tests, enable when required.
    fetch: mockFetch, // Required for unit tests
}

export const mockSession = new Session(mockSessionArgs, mockSessionOptions)
