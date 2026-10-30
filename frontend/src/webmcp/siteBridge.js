// frontend/src/webmcp/siteBridge.js
//
// Imperative handles that React components publish for the WebMCP tool layer.
// It lives outside React on purpose: tools are registered once per document, but
// the components they drive mount/unmount independently. Tools read a handle at
// CALL time (never at registration time), so a tool can report "that part of the
// page isn't mounted" instead of firing into a stale closure.

const handles = new Map();

export const publishHandle = (key, value) => {
  handles.set(key, value);
};

export const revokeHandle = (key) => {
  handles.delete(key);
};

export const readHandle = (key) => handles.get(key) || null;

export const requireHandle = (key) => {
  const handle = handles.get(key);
  if (!handle) {
    throw new Error(
      `The "${key}" part of the page isn't available right now (not mounted). ` +
        `Try the home page first.`,
    );
  }
  return handle;
};
