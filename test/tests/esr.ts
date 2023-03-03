import {expect} from 'chai'
import {extractSignaturesFromCallback} from 'src/esr'
import {Signature} from '@wharfkit/session'
import {mockCallbackPayload} from '$test/utils/mock-esr'

suite('extractSignaturesFromCallback', () => {
    test('should extract signatures from the callback payload', () => {
        const payload = mockCallbackPayload

        const expectedSignatures = [Signature.from(mockCallbackPayload.sig)]

        const actualSignatures = extractSignaturesFromCallback(payload)

        expect(actualSignatures).to.deep.equal(expectedSignatures)
    })
})
