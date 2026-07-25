import {Cancelable, PromptArgs, PromptElement, PromptResponse, UserInterface} from '@wharfkit/session'

export interface RecordingUserInterface extends UserInterface {
    prompts: PromptArgs[]
    statuses: string[]
    lastPrompt(): PromptArgs | undefined
    clickButton(index: number): void
    close(reason?: string): void
}

export function makeMockUI(): RecordingUserInterface {
    const prompts: PromptArgs[] = []
    const statuses: string[] = []
    let rejectCurrent: ((reason: Error) => void) | undefined

    const ui: any = {
        prompts,
        statuses,
        lastPrompt() {
            return prompts[prompts.length - 1]
        },
        clickButton(index: number) {
            const args = ui.lastPrompt()
            if (!args) {
                throw new Error('No prompt has been shown')
            }
            const buttons = (args.elements as PromptElement[]).filter((e) => e.type === 'button')
            const button: any = buttons[index]
            if (!button) {
                throw new Error(`No button at index ${index} (found ${buttons.length})`)
            }
            button.data.onClick()
        },
        close(reason = 'Modal closed') {
            if (rejectCurrent) {
                rejectCurrent(new Error(reason))
                rejectCurrent = undefined
            }
        },
        status(message: string) {
            statuses.push(message)
            return Promise.resolve()
        },
        prompt(args: PromptArgs): Cancelable<PromptResponse> {
            prompts.push(args)
            const promise = new Promise<PromptResponse>((resolve, reject) => {
                rejectCurrent = reject
            })
            // Swallow the default unhandled rejection; tests assert on the caller's handling.
            promise.catch(() => undefined)
            return Object.assign(promise, {
                cancel: (reason?: string) => {
                    ui.close(reason)
                    return promise as Cancelable<PromptResponse>
                },
            }) as Cancelable<PromptResponse>
        },
        getTranslate() {
            return (key: string, options?: Record<string, any>) =>
                (options && options.default) || key
        },
        translate(key: string) {
            return key
        },
        addTranslations() {},
        onLogin: () => Promise.resolve(),
        onLoginComplete: () => Promise.resolve(),
        onTransact: () => Promise.resolve(),
        onTransactComplete: () => Promise.resolve(),
        onSign: () => Promise.resolve(),
        onSignComplete: () => Promise.resolve(),
        onBroadcast: () => Promise.resolve(),
        onBroadcastComplete: () => Promise.resolve(),
        onAccountCreate: () => Promise.resolve(),
        onAccountCreateComplete: () => Promise.resolve(),
        onError: () => Promise.resolve(),
    }
    return ui as RecordingUserInterface
}
