export function shouldOpenNoteShortcut(input: {
  key: string;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  editableTarget?: boolean;
}): boolean {
  return input.key.toLowerCase() === "n"
    && !input.defaultPrevented
    && !input.altKey
    && !input.ctrlKey
    && !input.metaKey
    && !input.editableTarget;
}
