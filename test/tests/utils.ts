import {expect} from 'chai'

import {snakeToPascal, snakeToCamel, logWarn, uuid} from 'src/utils'

suite('utils', () => {
    suite('snakeToPascal', () => {
        test('should return PascalCase version of snake_case string', () => {
            expect(snakeToPascal('hello_world')).to.equal('HelloWorld')
            expect(snakeToPascal('')).to.equal('')
        })
    })

    suite('snakeToCamel', () => {
        test('should return camelCase version of snake_case string', () => {
            expect(snakeToCamel('hello_world')).to.equal('helloWorld')
            expect(snakeToCamel('')).to.equal('')
        })
    })

    suite('logWarn', () => {
        test('should print a warning message to console', () => {
            const warn = console.warn
            const messages: any[] = []
            console.warn = (...args: any[]) => {
                messages.push(args)
            }
            logWarn('this is a warning')
            console.warn = warn
            expect(messages[0]).to.deep.equal(['[anchor-link]', 'this is a warning'])
        })
    })

    suite('uuid', () => {
        test('should generate a UUID string', () => {
            const regex = /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i
            expect(uuid()).to.match(regex)
        })
    })
})
