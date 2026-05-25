export function useConfirm() {
  function confirm(message: string): boolean {
    return window.confirm(message)
  }
  return { confirm }
}
