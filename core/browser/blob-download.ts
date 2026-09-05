export type BlobDownloadAdapter = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
  appendAnchor: (anchor: HTMLAnchorElement) => void;
  scheduleCleanup: (cleanup: () => void) => void;
};

const BLOB_DOWNLOAD_CLEANUP_DELAY_MS = 1_000;

function cleanupDownload(
  adapter: BlobDownloadAdapter,
  url: string,
  anchor: HTMLAnchorElement,
) {
  // Cleanup is best effort: a browser-specific revoke/remove failure must not
  // turn a successful download into an uncaught timer error or mask the
  // original error that the caller needs to show.
  try {
    adapter.revokeObjectURL(url);
  } catch {
    // The object URL may already have been revoked by the browser.
  }
  try {
    anchor.remove();
  } catch {
    // The anchor may already have been detached by the browser.
  }
}

function createBrowserAdapter(): BlobDownloadAdapter {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendAnchor: (anchor) => document.body.appendChild(anchor),
    scheduleCleanup: (cleanup) => {
      window.setTimeout(cleanup, BLOB_DOWNLOAD_CLEANUP_DELAY_MS);
    },
  };
}

/**
 * Starts a browser Blob download and keeps its temporary DOM resources alive
 * long enough for Safari/iOS to begin reading the object URL. Any failure
 * after URL creation revokes the URL and removes the hidden anchor before the
 * error is rethrown to the caller, so the UI can present its own status.
 */
export function downloadBlob(
  blob: Blob,
  filename: string,
  adapter: BlobDownloadAdapter = createBrowserAdapter(),
) {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;

  try {
    url = adapter.createObjectURL(blob);
    anchor = adapter.createAnchor();
    anchor.href = url;
    anchor.download = filename;
    anchor.setAttribute("aria-hidden", "true");
    anchor.style.display = "none";
    adapter.appendAnchor(anchor);
    anchor.click();

    const cleanupUrl = url;
    const cleanupAnchor = anchor;
    adapter.scheduleCleanup(() => {
      cleanupDownload(adapter, cleanupUrl, cleanupAnchor);
    });
  } catch (error) {
    if (url && anchor) cleanupDownload(adapter, url, anchor);
    else if (url) {
      try {
        adapter.revokeObjectURL(url);
      } catch {
        // Best-effort cleanup must not mask the originating error.
      }
    }
    throw error;
  }
}
