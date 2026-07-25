import {assert} from 'chai'

import translations from '$lib/translations'

function flatten(value: Record<string, any>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof entry === 'string') {
            result[path] = entry
        } else {
            Object.assign(result, flatten(entry, path))
        }
    }
    return result
}

function placeholders(value: string): string[] {
    return Array.from(value.matchAll(/{{([^}]+)}}/g), (match) => match[1]).sort()
}

suite('translations', function () {
    const english = flatten(translations.en)

    for (const [locale, definitions] of Object.entries(translations)) {
        if (locale === 'en') continue

        test(`${locale} matches the English keys and placeholders`, function () {
            const localized = flatten(definitions)
            assert.deepEqual(Object.keys(localized).sort(), Object.keys(english).sort())
            for (const [key, source] of Object.entries(english)) {
                assert.deepEqual(
                    placeholders(localized[key]),
                    placeholders(source),
                    `${locale}.${key}`
                )
            }
        })
    }
})
