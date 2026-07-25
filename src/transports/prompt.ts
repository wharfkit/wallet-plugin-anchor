import {PromptElement} from '@wharfkit/session'

/** A button offering to move the login to the other Anchor transport. */
export function switchButton(label: string, variant: string, onSelect: () => void): PromptElement {
    return {
        type: 'button',
        label,
        data: {label, variant, onClick: () => onSelect()},
    }
}
