import { onMounted, onUnmounted } from 'vue'

export interface HotkeyOptions {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
  handler: () => void
}

/**
 * Composable for handling keyboard shortcuts
 */
export const useHotkey = (options: HotkeyOptions) => {
  const handleKeydown = (event: KeyboardEvent) => {
    // Check if modifier keys match
    const ctrlMatch = options.ctrl === undefined || event.ctrlKey === options.ctrl
    const altMatch = options.alt === undefined || event.altKey === options.alt
    const shiftMatch = options.shift === undefined || event.shiftKey === options.shift
    const metaMatch = options.meta === undefined || event.metaKey === options.meta
    
    // Check if the pressed key matches
    const keyMatch = event.key.toLowerCase() === options.key.toLowerCase()
    
    // Don't trigger if typing in input/textarea
    const target = event.target as HTMLElement
    const isTyping = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.isContentEditable
    
    if (keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch && !isTyping) {
      event.preventDefault()
      options.handler()
    }
  }
  
  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })
  
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}