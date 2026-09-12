export interface NetworkDebuggerProps {
  defaultVisible?: boolean
  defaultPinned?: boolean
  hotkey?: string
  hotkeyModifiers?: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
  }
}
