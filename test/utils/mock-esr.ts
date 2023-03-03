import {CallbackPayload, ResolvedSigningRequest, SigningRequest} from '@wharfkit/session'
import zlib from 'pako'

import {mockChainId} from './mock-config'
import {mockAbiProvider} from './mock-context'

export const mockCallbackPayload: CallbackPayload = {
    sig: 'SIG_K1_K4nkCupUx3hDXSHq4rhGPpDMPPPjJyvmF3M6j7ppYUzkR3L93endwnxf3YhJSG4SSvxxU1ytD8hj39kukTeYxjwy5H3XNJ',
    tx: 'b8e921a7b68d7309847e633d74963f25eb5a7d0b15b1aceb143723c234686a8d',
    rbn: '0',
    rid: '0',
    ex: '2020-07-10T08:40:20',
    req: 'esr://AwAAAwAAAAAAAChdAAAVbXlhcHA6Ly9sb2dpbj17e2NpZH19AQljaGFpbl9pZHMFAgABAAo',
    sa: 'foo',
    sp: 'active',
    cid: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
}

export const makeMockResolvedSigningRequest = () =>
    ResolvedSigningRequest.fromPayload(mockCallbackPayload, {zlib, abiProvider: mockAbiProvider})

export const mockSigningRequest = SigningRequest.from(mockCallbackPayload.req, {
    zlib,
})
